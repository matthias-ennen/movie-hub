package de.matthiasennen.moviehub;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

public class TmdbApiClientTest {
    @Test
    public void readsNumericRatingFromTmdbRatedEndpointShape() {
        assertEquals(8.5, TmdbApiClient.extractRatingValue(8.5), 0.0001);
        assertEquals(9.0, TmdbApiClient.extractRatingValue(9), 0.0001);
    }

    @Test
    public void ignoresMissingOrInvalidRatingValues() {
        assertEquals(0.0, TmdbApiClient.extractRatingValue(null), 0.0001);
        assertEquals(0.0, TmdbApiClient.extractRatingValue("8.5"), 0.0001);
        assertEquals(0.0, TmdbApiClient.extractRatingValue(Double.NaN), 0.0001);
    }

    @Test
    public void rejectsInvalidTargetMetadataRequestsBeforeNetworkAccess() {
        try {
            TmdbApiClient.fetchTitleMetadata("token", "person", 562);
            fail("Invalid media type must be rejected.");
        } catch (TmdbApiClient.TmdbException error) {
            assertEquals(TmdbApiClient.ErrorKind.RESPONSE, error.getKind());
        }
    }
}
