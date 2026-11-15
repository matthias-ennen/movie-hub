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
        assertTrue(ProviderUrlPolicy.isAllowed("waipu",
                "https://app.waipu.tv/epgdetails/kinowelt/7c5d8267-439f-5e0f-8fb7-e44349f60746"));
    }

    @Test
    public void acceptsOnlyExactReviewedLinearStationTargets() {
        assertTrue(ProviderUrlPolicy.isAllowed("air-ard", "https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-ard", "https://www.ardmediathek.de/live/Y3JpZDovL2Rhc2Vyc3RlLmRlL2xpdmUvY2xpcC9hYmNhMDdhMy0zNDc2LTQ4NTEtYjE2Mi1mZGU4ZjY0NmQ0YzQ?redirect=other"));
        assertTrue(ProviderUrlPolicy.isAllowed("air-zdf", "https://www.zdf.de/live-tv/zdf-live-beitrag-100"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-zdf", "https://www.zdf.de/live-tv/zdf-live-beitrag-100?redirect=other"));
        assertTrue(ProviderUrlPolicy.isAllowed("air-rtl", "https://plus.rtl.de/rtlde-rtl"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-rtl", "https://plus.rtl.de/rtlde-rtl?redirect=other"));
        assertTrue(ProviderUrlPolicy.isAllowed("air-pro7", "https://www.joyn.de/live-tv/prosieben"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-pro7", "https://www.joyn.de/live-tv/prosieben?redirect=other"));
        assertTrue(ProviderUrlPolicy.isAllowed("air-sat1", "https://www.joyn.de/live-tv/sat1"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-sat1", "https://www.joyn.de/live-tv/sat1?redirect=other"));
        assertTrue(ProviderUrlPolicy.isAllowed("air-vox", "https://plus.rtl.de/rtlde-vox"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-vox", "https://plus.rtl.de/rtlde-vox?redirect=other"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-rtl", "https://plus.rtl.de/rtlde-vox"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-pro7", "https://www.joyn.de/live-tv/sat1"));
        assertFalse(ProviderUrlPolicy.isAllowed("air-unknown", "https://www.zdf.de/live-tv/zdf-live-beitrag-100"));
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
