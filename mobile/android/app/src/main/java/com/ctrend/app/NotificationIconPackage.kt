package com.ctrend.app

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class NotificationIconPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NotificationIconModule.NAME) NotificationIconModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            NotificationIconModule.NAME to ReactModuleInfo(
                NotificationIconModule.NAME,
                NotificationIconModule.NAME,
                false, false, false, false
            )
        )
    }
}
