import {
  defaultPreferences,
  PreferencesSchema,
  PREFERENCES_ID,
  type Preferences,
} from "../../core/domain/preferences.ts";
import type {
  PreferencesStore,
  SettingsStore,
} from "../../core/ports/stores.ts";
import { createLogger } from "../../core/util/logger.ts";

const logger = createLogger("preferences-store");

const COLLECTION = "preferences";

export class JsonPreferencesStore implements PreferencesStore {
  constructor(private readonly settings: SettingsStore) {}

  read(): Preferences {
    try {
      return (
        this.settings.findById(COLLECTION, PREFERENCES_ID, PreferencesSchema) ??
        defaultPreferences()
      );
    } catch (error) {
      logger.error("Failed to read preferences, using the defaults", error);
      return defaultPreferences();
    }
  }

  write(changes: Partial<Preferences>): Preferences {
    const next = PreferencesSchema.parse({ ...this.read(), ...changes });

    try {
      this.settings.save(COLLECTION, next, PreferencesSchema);
    } catch (error) {
      logger.error("Failed to save preferences", error);
    }

    return next;
  }
}
