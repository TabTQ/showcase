package dev.showcasedocs;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** docs.* settings. */
@ConfigurationProperties(prefix = "docs")
public record DocsProperties(String dataDir, Integer maxAssetMb, Integer maxBundleMb) {

    public DocsProperties {
        dataDir = blank(dataDir) ? "./data" : dataDir;
        maxAssetMb = maxAssetMb == null || maxAssetMb <= 0 ? 20 : maxAssetMb;
        maxBundleMb = maxBundleMb == null || maxBundleMb <= 0 ? 25 : maxBundleMb;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
