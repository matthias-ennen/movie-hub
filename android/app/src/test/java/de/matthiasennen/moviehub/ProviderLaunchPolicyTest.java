package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ProviderLaunchPolicyTest {
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
