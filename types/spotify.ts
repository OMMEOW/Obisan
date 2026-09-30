export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyUserProfile = {
  id: string;
  display_name: string | null;
  email?: string | null;
  country?: string | null;
  product?: string | null;
  uri: string;
  external_urls: { spotify: string };
  images: SpotifyImage[];
  followers: { total: number };
};

export type SpotifyArtistRef = {
  id: string;
  name: string;
  uri: string;
};

export type SpotifyAlbumRef = {
  id: string;
  name: string;
  uri: string;
  album_type: string;
  total_tracks: number;
  release_date: string;
  release_date_precision: "day" | "month" | "year";
  images: SpotifyImage[];
  artists: SpotifyArtistRef[];
};

export type SpotifyTrackObject = {
  id: string;
  name: string;
  uri: string;
  explicit: boolean;
  popularity: number;
  duration_ms: number;
  disc_number: number;
  track_number: number;
  preview_url: string | null;
  artists: SpotifyArtistRef[];
  album: SpotifyAlbumRef;
};

export type SpotifyPlaylistObject = {
  id: string;
  name: string;
  description: string | null;
  uri: string;
  public: boolean | null;
  collaborative: boolean;
  snapshot_id: string;
  tracks: { total: number };
  owner: { id: string; display_name: string | null };
  images: SpotifyImage[];
};

export type SpotifyAudioFeature = {
  id: string;
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
  speechiness: number;
  tempo: number;
  valence: number;
  key: number;
  mode: number;
  time_signature: number;
  duration_ms: number;
};
