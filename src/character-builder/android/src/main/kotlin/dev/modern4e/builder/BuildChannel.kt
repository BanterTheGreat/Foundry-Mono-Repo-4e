package dev.modern4e.builder

/** Text of the Home notice that marks a debug build. */
internal const val DebugBuildNotice = "Debug build"

/**
 * The notice Home shows so testers can tell a debug build from a release one.
 *
 * @param debug whether this is a debug build; defaults to the running build's flag.
 * @return [DebugBuildNotice] for a debug build, null for a release build.
 */
internal fun buildChannelNotice(debug: Boolean = BuildConfig.DEBUG): String? = if (debug) DebugBuildNotice else null
