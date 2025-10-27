require_relative "image_downloader"

class MapSiteGenerator
  attr_reader :features

  def initialize(features:, local: false, verbose: false)
    @features = features
    @local = local
    @verbose = verbose

    @output_file_path = "assets/data/features.geojson"
  end

  def call
    features_with_images = download_images(features)
    write_geojson(features_with_images)
  end

  private

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
      "name" => "Features Layer",
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

  def local? = @local

  def log(message)
    puts(message) if @verbose
  end
end
