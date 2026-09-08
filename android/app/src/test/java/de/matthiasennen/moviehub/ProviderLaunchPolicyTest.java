package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ProviderLaunchPolicyTest {
    @Test
    public void searchesTextFirstForAppsThatIgnoredTheirHttpsQuery() {
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("netflix"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("prime"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("disney"));
        assertTrue(ProviderLaunchPolicy.triesTextSearchFirst("waipu"));
    }

    @Test
    public void keepsVerifiedYouTubeHttpsSearchFirst() {
        assertFalse(ProviderLaunchPolicy.triesTextSearchFirst("youtube"));
        assertFalse(ProviderLaunchPolicy.triesTextSearchFirst("unknown"));
        assertFalse(ProviderLaunchPolicy.triesTextSearchFirst(null));
    }
}
