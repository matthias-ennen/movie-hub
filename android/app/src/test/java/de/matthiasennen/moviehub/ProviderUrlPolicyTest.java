package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ProviderUrlPolicyTest {
    @Test
    public void acceptsSupportedProviderOwnedHttpsDomains() {
        assertTrue(ProviderUrlPolicy.isAllowed("netflix", "https://www.netflix.com/title/81914143"));
        assertTrue(ProviderUrlPolicy.isAllowed("prime", "https://www.primevideo.com/detail/example"));
        assertTrue(ProviderUrlPolicy.isAllowed("prime", "https://www.amazon.de/gp/video/detail/B0GCKBV5DQ"));
        assertTrue(ProviderUrlPolicy.isAllowed("disney", "https://www.disneyplus.com/browse/entity-example"));
        assertTrue(ProviderUrlPolicy.isAllowed("youtube", "https://youtu.be/KQeEIbN296U"));
        assertTrue(ProviderUrlPolicy.isAllowed("waipu", "https://www.waipu.tv/program/example"));
    }

    @Test
    public void rejectsMismatchedSpoofedAndInsecureUrls() {
        assertFalse(ProviderUrlPolicy.isAllowed("disney", "https://www.netflix.com/title/81914143"));
        assertFalse(ProviderUrlPolicy.isAllowed("netflix", "https://netflix.com.example.org/title/81914143"));
        assertFalse(ProviderUrlPolicy.isAllowed("netflix", "http://www.netflix.com/title/81914143"));
        assertFalse(ProviderUrlPolicy.isAllowed("netflix", "https://user:secret@www.netflix.com/title/81914143"));
        assertFalse(ProviderUrlPolicy.isAllowed("unknown", "https://www.netflix.com/title/81914143"));
    }
}
