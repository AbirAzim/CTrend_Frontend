package com.ctrend.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import androidx.core.app.RemoteInput
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Handles the "Reply" and "👍 Like" action buttons on a chat notification posted
 * by [CtrendMessagingService] while the app is backgrounded/killed.
 *
 * Runs entirely natively (no JS runtime): reads the auth token AsyncStorage saved
 * under `ctrend_access_token`, then POSTs the matching GraphQL mutation. This lets
 * reply/like work even when the app process is dead.
 */
class NotificationActionReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION_REPLY = "com.ctrend.app.ACTION_REPLY"
    const val ACTION_LIKE = "com.ctrend.app.ACTION_LIKE"
    const val EXTRA_CONVERSATION_ID = "conversationId"
    const val EXTRA_MESSAGE_ID = "messageId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    const val EXTRA_NOTIFICATION_TAG = "notificationTag"
    const val KEY_REPLY_TEXT = "key_reply_text"
    private const val LIKE_EMOJI = "👍" // 👍

    // Keep in sync with mobile/.env → EXPO_PUBLIC_GRAPHQL_HTTP
    private const val GRAPHQL_HTTP =
      "https://seashell-app-stt6c.ondigitalocean.app/graphql"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID).orEmpty()
    val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID).orEmpty()
    val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
    val notificationTag = intent.getStringExtra(EXTRA_NOTIFICATION_TAG)
    val appContext = context.applicationContext

    val replyText = RemoteInput.getResultsFromIntent(intent)
      ?.getCharSequence(KEY_REPLY_TEXT)?.toString()?.trim().orEmpty()

    // Network must run off the main thread; keep the receiver alive until done.
    val pending = goAsync()
    thread {
      try {
        val token = readAuthToken(appContext) ?: return@thread
        when (action) {
          ACTION_REPLY ->
            if (replyText.isNotEmpty() && conversationId.isNotEmpty()) {
              sendMessage(token, conversationId, replyText)
            }
          ACTION_LIKE ->
            if (messageId.isNotEmpty()) {
              reactMessage(token, messageId, LIKE_EMOJI)
            }
        }
      } catch (_: Exception) {
        // Best-effort — a failed reply/like should never crash the receiver.
      } finally {
        val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (!notificationTag.isNullOrEmpty()) {
          nm?.cancel(notificationTag, 0)
        } else if (notificationId != -1) {
          nm?.cancel(notificationId)
        }
        pending.finish()
      }
    }
  }

  private fun sendMessage(token: String, conversationId: String, text: String) {
    val variables = JSONObject()
      .put("conversationId", conversationId)
      .put("text", text)
    val query =
      "mutation Reply(\$conversationId: ID!, \$text: String) " +
        "{ sendMessage(conversationId: \$conversationId, text: \$text) { id } }"
    postGraphql(token, query, variables)
  }

  private fun reactMessage(token: String, messageId: String, emoji: String) {
    val variables = JSONObject()
      .put("messageId", messageId)
      .put("emoji", emoji)
    val query =
      "mutation Like(\$messageId: ID!, \$emoji: String) " +
        "{ reactMessage(messageId: \$messageId, emoji: \$emoji) { id } }"
    postGraphql(token, query, variables)
  }

  private fun postGraphql(token: String, query: String, variables: JSONObject) {
    val body = JSONObject().put("query", query).put("variables", variables).toString()
    val conn = (URL(GRAPHQL_HTTP).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10000
      readTimeout = 10000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Authorization", "Bearer $token")
    }
    try {
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      // Drain the response so the request actually completes.
      val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
      stream?.use { it.readBytes() }
    } finally {
      conn.disconnect()
    }
  }

  /** Reads the JWT AsyncStorage persisted under `ctrend_access_token`. */
  private fun readAuthToken(context: Context): String? {
    return try {
      val dbFile = context.getDatabasePath("RKStorage")
      if (!dbFile.exists()) return null
      SQLiteDatabase.openDatabase(
        dbFile.path, null, SQLiteDatabase.OPEN_READONLY,
      ).use { db ->
        db.rawQuery(
          "SELECT value FROM catalystLocalStorage WHERE key = ?",
          arrayOf("ctrend_access_token"),
        ).use { c -> if (c.moveToFirst()) c.getString(0) else null }
      }
    } catch (_: Exception) {
      null
    }
  }
}
