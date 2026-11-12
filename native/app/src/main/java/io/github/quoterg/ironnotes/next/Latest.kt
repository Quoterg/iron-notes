package io.github.quoterg.ironnotes.next

/** Request counter: only the most recently issued request id may apply its result. */
internal class Latest {
    private var current = 0

    fun next(): Int = ++current

    fun isLatest(id: Int): Boolean = id == current
}
