require "dotenv/load"
require_relative "lib/map_site_generator"
require_relative "lib/csv_downloader_and_processor"
require_relative "lib/kml_downloader_and_processor"

directory "tmp"
directory "assets/data"

task build: [:tmp, "assets/data"] do
  local, verbose = true, true

  features = if ENV["CSV_URL"].present?
    CsvDownloaderAndProcessor.new(
      csv_url: ENV["CSV_URL"],
      config: {
        slug: "_uuid",
        property_names: ["nome", "descricao", "pelouro", "tema", "estado"],
        image_property_names: ["Point and shoot! Use the camera to take a photo_URL"],
        latitude: "_Escolhe um local_latitude",
        longitude: "_Escolhe um local_longitude"
      },
      local: local,
      verbose: verbose
    ).call
  elsif ENV["MY_GOOGLE_MAPS_ID"].present?
    KmlDownloaderAndProcessor.new(
      map_id: ENV["MY_GOOGLE_MAPS_ID"],
      local: local,
      verbose: verbose
    ).call
  end

  MapSiteGenerator.new(
    features: features,
    local: local,
    verbose: verbose
  ).call
end
