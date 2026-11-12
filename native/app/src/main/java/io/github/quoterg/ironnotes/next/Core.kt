package io.github.quoterg.ironnotes.next

import android.content.Context
import io.github.quoterg.ironnotes.core.IronCore

/**
 * The one open database for the app (the Rust core's SQLite file in the app's private storage, never
 * backed up to the cloud — see res/xml/data_extraction_rules.xml). Opened on first use, off the main
 * thread: callers are on Dispatchers.IO.
 */
object Core {
    @Volatile private var core: IronCore? = null

    fun get(context: Context): IronCore =
        core ?: synchronized(this) {
            core ?: IronCore.open(context.applicationContext.getDatabasePath("iron-notes.db").apply { parentFile?.mkdirs() }.path)
                .also { core = it }
        }
}
