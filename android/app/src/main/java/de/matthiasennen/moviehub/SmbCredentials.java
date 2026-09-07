package de.matthiasennen.moviehub;

final class SmbCredentials {
    private final String username;
    private final String password;

    SmbCredentials(String username, String password) {
        this.username = username == null ? "" : username;
        this.password = password == null ? "" : password;
    }

    String getUsername() { return username; }
    char[] getPasswordChars() { return password.toCharArray(); }
    String getPassword() { return password; }
}
