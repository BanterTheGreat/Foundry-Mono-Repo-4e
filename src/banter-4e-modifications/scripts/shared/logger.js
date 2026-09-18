import { MODULE_NAME, ENABLE_DEBUG_LOGGING } from "./globals.js";

export class Logger {
    static isEnabled() {
        if (!game.settings.settings.has(`${MODULE_NAME}.${ENABLE_DEBUG_LOGGING}`)) {
            return false;
        }

        return game.settings.get(MODULE_NAME, ENABLE_DEBUG_LOGGING);
    }

    static formatMessage(message, context) {
        const prefix = `${MODULE_NAME} | ${message}`;

        if (context === undefined) {
            return prefix;
        }

        return `${prefix} ${JSON.stringify(context)}`;
    }

    static notify(level, message, context) {
        const debugLoggingEnabled = Logger.isEnabled();

        // Log info to console if debug logging is enabled.
        if (level === "info") {
            if (debugLoggingEnabled) {
                console.info(Logger.formatMessage(message, context));
            }

            return;
        }

        // Log warnings to console if debug logging is enabled.
        if (level === "warn" && !debugLoggingEnabled) {
            return;
        }

        // Log errors to console regardless of debug logging setting.
        const formattedMessage = Logger.formatMessage(message, context);
        ui.notifications[level](formattedMessage, {console: false});

        if (level === "warn") {
            console.warn(formattedMessage);
        } else if (level === "error") {
            console.error(formattedMessage);
        }
    }

    static info(message, context) {
        Logger.notify("info", message, context);
    }

    static warn(message, context) {
        Logger.notify("warn", message, context);
    }

    static error(message, context) {
        Logger.notify("error", message, context);
    }
}
