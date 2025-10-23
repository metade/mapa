require_relative "kml_downloader_and_processor"
require_relative "image_downloader"
require_relative "my_google_maps_downloader"

class MyGoogleMapsDownloader
  attr_reader :map_id

  def initialize(map_id:, local: false)
    @map_id = map_id
    @local = local

    @output_file_path = "assets/data/features.geojson"
  end

  def call()
    features = download_and_parse_kml
    features_with_images = download_images(features)
    write_geojson(features_with_images)
  end

  private

  def download_and_parse_kml
    KmlDownloaderAndProcessor.new(
      map_id: map_id,
      local: local?,
      property_names: [
        "slug", "descricao", "pelouro", "tema", "estado",
      ],
      image_property_names: [
        "gx_media_links",
        "point and shoot! use the camera to take a photo_url"
      ],
    ).call
  end

  def download_images(data)
    image_downloader = ImageDownloader.new(
      images_dir: "assets/data/images",
      verbose: true
    )

    data.map do |feature|
      if feature["properties"]["imagens"].nil?
        feature
      else
        feature["properties"]["imagens"] = feature["properties"]["imagens"].map do |image_url|
          image_downloader.download_image(image_url)
        end

        feature
      end
    end
  end

  def write_geojson(features)
    geojson = {
      "type" => "FeatureCollection",
      "name" => "Features Layer (#{map_id})",
      "crs" => {
        "type" => "name",
        "properties" => {
          "name" => "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
      },
      "features" => features
    }

    # Write the GeoJSON file
    File.write(@output_file_path, JSON.pretty_generate(geojson))
    log "Saved final GeoJSON to #{@output_file_path}"
  end

  def local?() = @local

  def log(message)
    puts(message) if @verbose
  end
end
