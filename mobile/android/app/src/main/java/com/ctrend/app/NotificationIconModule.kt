package com.ctrend.app

import android.graphics.*
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

@ReactModule(name = NotificationIconModule.NAME)
class NotificationIconModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NotificationIconComposer"
    }

    override fun getName() = NAME

    @ReactMethod
    fun compose(avatarUrl: String, promise: Promise) {
        Thread {
            try {
                val ctx = reactApplicationContext.applicationContext
                val avatar = downloadBitmap(avatarUrl)
                    ?: return@Thread promise.reject("ERR_DOWNLOAD", "Could not download avatar")

                val iconSize = 96
                val appIcon = Bitmap.createBitmap(iconSize, iconSize, Bitmap.Config.ARGB_8888)
                ctx.packageManager.getApplicationIcon(ctx.packageName).apply {
                    setBounds(0, 0, iconSize, iconSize)
                    draw(Canvas(appIcon))
                }

                val composed = composeBitmaps(avatar, appIcon, 256)
                avatar.recycle()
                appIcon.recycle()

                val out = ByteArrayOutputStream()
                composed.compress(Bitmap.CompressFormat.PNG, 95, out)
                composed.recycle()

                promise.resolve("data:image/png;base64," +
                    Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
            } catch (e: Exception) {
                promise.reject("ERR_COMPOSE", e.message ?: "Unknown error")
            }
        }.start()
    }

    private fun downloadBitmap(urlStr: String): Bitmap? = try {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        conn.connectTimeout = 8_000
        conn.readTimeout = 8_000
        conn.connect()
        BitmapFactory.decodeStream(conn.inputStream)
    } catch (_: Exception) { null }

    private fun composeBitmaps(avatar: Bitmap, badge: Bitmap, size: Int): Bitmap {
        val result = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        val avatarScaled = Bitmap.createScaledBitmap(avatar, size, size, true)
        paint.shader = BitmapShader(avatarScaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        paint.shader = null
        avatarScaled.recycle()

        val badgeR = size * 0.18f
        val badgeCx = size - badgeR
        val badgeCy = size - badgeR

        paint.color = Color.WHITE
        canvas.drawCircle(badgeCx, badgeCy, badgeR + size * 0.025f, paint)

        val badgeDim = (badgeR * 2).toInt()
        val badgeScaled = Bitmap.createScaledBitmap(badge, badgeDim, badgeDim, true)
        val m = Matrix().also { it.setTranslate(badgeCx - badgeR, badgeCy - badgeR) }
        paint.shader = BitmapShader(badgeScaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
            .also { it.setLocalMatrix(m) }
        canvas.drawCircle(badgeCx, badgeCy, badgeR, paint)
        paint.shader = null
        badgeScaled.recycle()

        return result
    }
}
