package de.matthiasennen.moviehub;

import static org.junit.Assert.assertEquals;

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
}
