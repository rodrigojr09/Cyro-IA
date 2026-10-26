import { mountSpotifyPlayer } from './spotify-ui';
if (new URLSearchParams(location.search).get('panel') === 'composer')
  mountSpotifyPlayer(document.getElementById('composer'));
