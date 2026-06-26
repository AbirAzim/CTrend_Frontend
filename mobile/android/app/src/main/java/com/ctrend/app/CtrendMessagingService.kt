package com.ctrend.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import kotlin.random.Random

/**
 * Renders CTrend's data-only FCM pushes natively — so killed-app notifications
 * show the sender's *round* avatar (Messenger-style) reliably, without waking the
 * JS runtime. Replaces expo-notifications' FCM service (see AndroidManifest).
 *
 * Tap deep-linking is done by launching MainActivity with a `ctrend://<route>`
 * VIEW intent, which expo-router resolves like any other deep link.
 */
class CtrendMessagingService : FirebaseMessagingService() {

  companion object {
    private const val CHANNEL_ID = "default"
    private val COMMENT_TYPES = setOf(
      "POST_COMMENT", "NEW_COMMENT", "COMMENT_REPLY", "COMMENT_REACTION", "COMMENT_LIKE"
    )
    private val POST_TYPES = setOf(
      "POST_HYPE", "POST_VOTE", "NEW_POST_FRIEND",
      "VOTE_ENDED", "VOTE_WINNER", "POST_WINNER", "VOTE_PRIZE_CLAIMED"
    )
    private val PROFILE_TYPES = setOf(
      "FRIEND_REQUEST", "FRIEND_REQUEST_ACCEPTED", "NEW_FOLLOWER"
    )
    private val ANNOUNCEMENT_TYPES = setOf("ANNOUNCEMENT", "ADMIN_BROADCAST", "SYSTEM")
    private val FIXTURE_TYPES = setOf("LINEUP_AVAILABLE", "MATCH_START", "MATCH_END")
    private const val PLAY_CLOSED_TESTING_URL =
      "https://play.google.com/apps/testing/com.ctrend.app"
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val type = data["type"] ?: ""
    if (type != "BELL" && type != "MESSAGE") return

    // Foreground UI is handled by the WebSocket + Notifee path — avoid duplicates.
    if (AppForeground.isInForeground) return

    val isMessage = type == "MESSAGE"
    val rawTitle = (if (isMessage) data["senderName"] else data["title"]) ?: ""
    val title = if (rawTitle.isNotBlank()) rawTitle else "Ke Jitbe"
    val body = data["body"] ?: ""
    val avatarUrl = (if (isMessage) data["senderAvatar"] else data["actorAvatar"]) ?: ""

    ensureChannel()

    val largeIcon = (if (avatarUrl.startsWith("https://")) circularBitmap(downloadBitmap(avatarUrl)) else null)
      ?: appLogoBitmap()

    val route = resolveRoute(data)
    val refType = (data["referenceType"] ?: "").uppercase()
    val intent = if (refType == "ANDROID_UPDATE_REQUIRED") {
      Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_CLOSED_TESTING_URL)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    } else {
      Intent(Intent.ACTION_VIEW, Uri.parse("ctrend://$route"), this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    }
    val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    val contentIntent = PendingIntent.getActivity(this, Random.nextInt(), intent, piFlags)

    val postId = data["postId"] ?: ""
    val refId = data["referenceId"] ?: ""
    val notifType = data["notifType"] ?: type
    val conversationId = data["conversationId"] ?: ""
    val notificationTag = when {
      isMessage && conversationId.isNotEmpty() -> "msg_$conversationId"
      !isMessage -> "bell_${if (postId.isNotEmpty()) postId else refId}_$notifType"
      else -> "ctrend_${System.currentTimeMillis()}"
    }

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher_monochrome)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(contentIntent)
    if (largeIcon != null) builder.setLargeIcon(largeIcon)
    if (body.isNotBlank()) builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))

    // Chat notifications get inline Reply + 👍 Like actions, handled natively
    // by NotificationActionReceiver so they work even with the app killed.
    if (isMessage) {
      addMessageActions(builder, data, notificationTag)
    }

    try {
      NotificationManagerCompat.from(this).notify(notificationTag, 0, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS not granted — nothing we can do here.
    }
  }

  /** Adds the inline "Reply" (RemoteInput) and "👍 Like" buttons to a chat notification. */
  private fun addMessageActions(
    builder: NotificationCompat.Builder,
    data: Map<String, String>,
    notificationTag: String,
  ) {
    val conversationId = data["conversationId"] ?: ""
    val messageId = data["messageId"] ?: ""
    if (conversationId.isEmpty()) return

    val mutableFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val immutableFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

    // Reply — inline text input (requires a MUTABLE PendingIntent for RemoteInput).
    val replyIntent = Intent(this, NotificationActionReceiver::class.java).apply {
      action = NotificationActionReceiver.ACTION_REPLY
      putExtra(NotificationActionReceiver.EXTRA_CONVERSATION_ID, conversationId)
      putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_TAG, notificationTag)
    }
    val replyPi = PendingIntent.getBroadcast(this, Random.nextInt(), replyIntent, mutableFlags)
    val remoteInput = RemoteInput.Builder(NotificationActionReceiver.KEY_REPLY_TEXT)
      .setLabel("Reply")
      .build()
    builder.addAction(
      NotificationCompat.Action.Builder(0, "Reply", replyPi)
        .addRemoteInput(remoteInput)
        .setAllowGeneratedReplies(false)
        .build(),
    )

    // Like — needs a messageId target to react to.
    if (messageId.isNotEmpty()) {
      val likeIntent = Intent(this, NotificationActionReceiver::class.java).apply {
        action = NotificationActionReceiver.ACTION_LIKE
        putExtra(NotificationActionReceiver.EXTRA_MESSAGE_ID, messageId)
        putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_TAG, notificationTag)
      }
      val likePi = PendingIntent.getBroadcast(this, Random.nextInt(), likeIntent, immutableFlags)
      builder.addAction(NotificationCompat.Action.Builder(0, "👍 Like", likePi).build())
    }
  }

  // ── Routing (mirrors the JS resolveNotificationRoute) ───────────────────────
  private fun resolveRoute(d: Map<String, String>): String {
    val refType = (d["referenceType"] ?: "").uppercase()
    if (refType == "ANDROID_UPDATE_REQUIRED") return "/notifications"

    val type = d["type"] ?: ""
    val refId = d["referenceId"] ?: ""
    val notifType = d["notifType"] ?: ""
    val postId = d["postId"] ?: ""
    val commentId = d["commentId"] ?: ""
    val conversationId = d["conversationId"] ?: ""

    val chatId = when {
      type == "MESSAGE" && conversationId.isNotEmpty() -> conversationId
      (refType == "CONVERSATION" || refType == "MESSAGE") && refId.isNotEmpty() -> refId
      else -> ""
    }
    if (chatId.isNotEmpty()) return "/chat/$chatId"

    // World Cup fixture → match detail screen. Lineup notifications open straight
    // to the Line-up tab. Checked before the post/comment branches (mirrors JS)
    // since lineup notifications also carry a postId fallback.
    if (FIXTURE_TYPES.contains(notifType) && refId.isNotEmpty()) {
      val tab = if (notifType == "LINEUP_AVAILABLE") "?tab=lineup" else ""
      return "/world-cup/match/$refId$tab"
    }
    if (refType == "FIXTURE" && refId.isNotEmpty()) return "/world-cup/match/$refId"

    val postTarget = when {
      postId.isNotEmpty() -> postId
      refType == "POST" && refId.isNotEmpty() -> refId
      else -> ""
    }
    val withComment = { base: String -> if (commentId.isNotEmpty()) "$base?commentId=$commentId" else base }

    if (COMMENT_TYPES.contains(notifType) && postTarget.isNotEmpty()) return withComment("/post/$postTarget")
    if (POST_TYPES.contains(notifType) && postTarget.isNotEmpty()) return "/post/$postTarget"
    if (PROFILE_TYPES.contains(notifType) && refId.isNotEmpty()) return "/profile/$refId"
    if (ANNOUNCEMENT_TYPES.contains(notifType)) return if (postTarget.isNotEmpty()) "/post/$postTarget" else "/notifications"

    if (postTarget.isNotEmpty()) return withComment("/post/$postTarget")
    if (refType == "USER" && refId.isNotEmpty()) return "/profile/$refId"
    return "/notifications"
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
        mgr.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Ke Jitbe", NotificationManager.IMPORTANCE_HIGH)
        )
      }
    }
  }

  private fun downloadBitmap(url: String): Bitmap? {
    return try {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 8000
        readTimeout = 8000
        instanceFollowRedirects = true
      }
      conn.inputStream.use { BitmapFactory.decodeStream(it) }
    } catch (_: Exception) {
      null
    }
  }

  private fun circularBitmap(src: Bitmap?): Bitmap? {
    if (src == null) return null
    val size = minOf(src.width, src.height).coerceAtLeast(1)
    // Center-crop the source to a square, then clip to a circle.
    val square = Bitmap.createBitmap(src, (src.width - size) / 2, (src.height - size) / 2, size, size)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    return output
  }

  private fun appLogoBitmap(): Bitmap? {
    val drawable: Drawable = ContextCompat.getDrawable(this, R.mipmap.ic_launcher) ?: return null
    if (drawable is BitmapDrawable && drawable.bitmap != null) return circularBitmap(drawable.bitmap)
    val w = drawable.intrinsicWidth.coerceAtLeast(1)
    val h = drawable.intrinsicHeight.coerceAtLeast(1)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)
    return circularBitmap(bmp)
  }
}
