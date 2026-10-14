// The root package.json `version` is the single release version (docs/releases.md).
import rootPackage from "../../../package.json" with { type: "json" };

export const APP_VERSION: string = rootPackage.version;
