package de.matthiasennen.moviehub;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TmdbResilientCatalogSyncTest {
    @Test
    public void retriesNetworkAndTemporaryHttpFailures() {
        assertTrue(TmdbResilientCatalogSync.isTransient(0, true));
        assertTrue(TmdbResilientCatalogSync.isTransient(429, false));
        assertTrue(TmdbResilientCatalogSync.isTransient(500, false));
        assertTrue(TmdbResilientCatalogSync.isTransient(502, false));
        assertTrue(TmdbResilientCatalogSync.isTransient(503, false));
        assertTrue(TmdbResilientCatalogSync.isTransient(504, false));
    }

    @Test
    public void doesNotRetryPermanentClientOrAuthenticationFailures() {
        assertFalse(TmdbResilientCatalogSync.isTransient(400, false));
        assertFalse(TmdbResilientCatalogSync.isTransient(401, false));
        assertFalse(TmdbResilientCatalogSync.isTransient(403, false));
        assertFalse(TmdbResilientCatalogSync.isTransient(404, false));
        assertFalse(TmdbResilientCatalogSync.isTransient(422, false));
    }
}
