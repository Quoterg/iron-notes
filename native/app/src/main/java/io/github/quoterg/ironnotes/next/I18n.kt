package io.github.quoterg.ironnotes.next

import android.content.Context
import org.json.JSONObject
import java.util.Locale

/**
 * The web app's strings (assets/strings.json, generated from src/lib/i18n.ts, strings-later.ts and
 * lang/sv.ts by src/lib/native-strings.test.ts) with the same `t()` as the web: the Swedish pack
 * first when the language is Swedish, English otherwise, the key itself as a last resort; `{name}`
 * placeholders replaced. Exercise, category and measure names are the user's data: only the starter
 * library's English names get a Swedish name (unless "gym English" is on), as on the web.
 */
class I18n private constructor(
    private val en: Map<String, String>,
    private val sv: Map<String, String>,
    private val enTypes: Map<String, String>,
    private val svTypes: Map<String, String>,
    private val svNames: Map<String, Map<String, String>>,
) {
    /** "en" or "sv". */
    @Volatile var lang: String = "en"
    @Volatile var gymEnglish: Boolean = false

    fun t(key: String, vararg vars: Pair<String, Any>): String {
        var s = (if (lang == "sv") sv[key] else null) ?: en[key] ?: key
        for ((k, v) in vars) s = s.replaceFirst("{$k}", v.toString())
        return s
    }

    /** A stored name as shown: the Swedish starter name in Swedish (table: exercises, categories, metrics). */
    fun shown(table: String, name: String): String =
        if (lang == "sv" && !(gymEnglish && table == "exercises")) svNames[table]?.get(name) ?: name else name

    /** An exercise type's name in the current language (web: packTypes, English from the later table). */
    fun typeName(type: String): String = (if (lang == "sv") svTypes[type] else null) ?: enTypes[type] ?: type

    /** Decimal comma in Swedish (display only; inputs and exports keep `.`). */
    val decimalComma: Boolean get() = lang == "sv"

    companion object {
        /** The phone's language when the setting is Auto: Swedish for sv, English otherwise. */
        fun detect(): String = if (Locale.getDefault().language == "sv") "sv" else "en"

        fun load(context: Context): I18n {
            val root = context.assets.open("strings.json").bufferedReader().use { JSONObject(it.readText()) }
            fun JSONObject.toMap(): Map<String, String> = keys().asSequence().associateWith { getString(it) }
            val sv = root.getJSONObject("sv")
            return I18n(
                en = root.getJSONObject("en").toMap(),
                enTypes = root.getJSONObject("enTypes").toMap(),
                sv = sv.getJSONObject("strings").toMap(),
                svTypes = sv.getJSONObject("types").toMap(),
                svNames = listOf("exercises", "categories", "metrics").associateWith { sv.getJSONObject(it).toMap() },
            ).also { it.lang = detect() }
        }
    }
}
