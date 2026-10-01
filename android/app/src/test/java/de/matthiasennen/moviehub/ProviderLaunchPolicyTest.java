package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ProviderLaunchPolicyTest {
    @Test
    public void distinguishesAppDeepLinksFromWebLinks() {
        assertTrue(ProviderLaunchPolicy.supportsPlaybackMode("APP_DEEP_LINK"));
        assertTrue(ProviderLaunchPolicy.supportsPlaybackMode("WEB_LINK"));
        assertFalse(ProviderLaunchPolicy.supportsPlaybackMode("DIRECT_STREAM"));
        assertFalse(ProviderLaunchPolicy.supportsPlaybackMode("RESOLVER"));

        assertTrue(ProviderLaunchPolicy.forcesProviderPackage("APP_DEEP_LINK"));
        assertFalse(ProviderLaunchPolicy.forcesProviderPackage("WEB_LINK"));
    }

    @Test
    public void validatesPlaybackScopesIndependentlyFromProvider() {
        assertTrue(ProviderLaunchPolicy.supportsPlaybackScope("program"));
        assertTrue(ProviderLaunchPolicy.supportsPlaybackScope("channel"));
        assertTrue(ProviderLaunchPolicy.supportsPlaybackScope("title"));
        assertTrue(ProviderLaunchPolicy.supportsPlaybackScope("provider"));
        assertTrue(ProviderLaunchPolicy.supportsPlaybackScope(""));
        assertFalse(ProviderLaunchPolicy.supportsPlaybackScope("made-up"));
    }

    @Test
    public void preservesConcreteProgramAndChannelTargets() {
        assertTrue(ProviderLaunchPolicy.preservesExactTarget("program"));
        assertTrue(ProviderLaunchPolicy.preservesExactTarget("channel"));
        assertFalse(ProviderLaunchPolicy.preservesExactTarget("title"));
        assertFalse(ProviderLaunchPolicy.preservesExactTarget("provider"));
        assertFalse(ProviderLaunchPolicy.preservesExactTarget(""));
        assertFalse(ProviderLaunchPolicy.preservesExactTarget(null));
    }

    @Test
    public void searchesTextFirstForEverySupportedProvider() {
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("netflix"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("prime"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("disney"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("youtube"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("waipu"));
    }

    @Test
    public void rejectsUnknownProvider() {
        assertFalse(ProviderLaunchPolicy.triesTextSearchFirst("unknown"));
        assertFalse(ProviderLaunchPolicy.triesTextSearchFirst(null));
    }
}
