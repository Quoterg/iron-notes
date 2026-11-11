# JNA and the UniFFI bindings use reflection (structures, callbacks, native method lookup).
-dontwarn java.awt.**
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.** { public *; }
-keep class io.github.quoterg.ironnotes.core.** { *; }
