require_relative "lib/my_google_maps_downloader"

directory "tmp"
directory "assets/data"

task build: [:tmp, "assets/data"] do
  map_id = ENV.fetch("MY_GOOGLE_MAPS_ID", "14i_TEtev-_2DaiJ5RE0rHN22gsgjNsI")

  MyGoogleMapsDownloader.new(
    map_id: map_id,
    local: false,
    verbose: true
  ).call
end
