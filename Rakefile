require_relative "lib/my_google_maps_downloader"

task :build do
  map_id = ENV.fetch("MY_GOOGLE_MAPS_ID", "14i_TEtev-_2DaiJ5RE0rHN22gsgjNsI")

  pp MyGoogleMapsDownloader.new(
    map_id: map_id,
    local: false
  ).call
end
