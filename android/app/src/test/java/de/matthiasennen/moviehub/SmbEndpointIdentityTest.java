package de.matthiasennen.moviehub;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class SmbEndpointIdentityTest {
    @Test
    public void normalizesHostAndShareCase() {
        assertEquals("fritz.nas/share",
                SmbEndpointIdentity.key("FRITZ.NAS", "Share"));
        assertEquals("fritz.nas/share",
                SmbEndpointIdentity.key("fritz.nas", "share"));
        assertEquals("fritz.nas/share",
                SmbEndpointIdentity.key(" fritz.nas ", " SHARE "));
    }

    @Test
    public void identifiesDifferentCaseAsSameConnection() {
        assertTrue(SmbEndpointIdentity.same(
                "FRITZ.NAS", "Share", "fritz.nas", "share"));
    }

    @Test
    public void keepsDifferentSharesDistinct() {
        assertEquals("fritz.nas/media", SmbEndpointIdentity.key("fritz.nas", "Media"));
        assertEquals("fritz.nas/backup", SmbEndpointIdentity.key("fritz.nas", "Backup"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMissingShare() {
        SmbEndpointIdentity.key("fritz.nas", "   ");
    }
}
