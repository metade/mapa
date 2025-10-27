require_relative "image_downloader"
require "active_support/core_ext/hash"
require "yaml"

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
    generate_jekyll_pages(features_with_images)
  end

  private

  def download_images(data)
    image_downloader = ImageDownloader.new(
      images_dir: "assets/data/images",
      verbose: true
    )

    data.map do |feature|
      if feature["properties"]["imagens"].present?
        feature["properties"]["imagens"] = feature["properties"]["imagens"].map do |image_url|
          image_downloader.download_image(image_url)
        end
      end

      feature
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

  def generate_jekyll_pages(features)
    Dir.mkdir("pontos") unless File.exist?("pontos")

    write_jekyll_file("pontos/index.html", {"layout" => "pontos"})

    features.each do |feature|
      slug = feature.dig("properties", "slug")
      raise "No slug defined for feature" unless slug.present?

      front_matter = {
        "layout" => "ponto"
      }.merge(feature["properties"])

      file_name = "pontos/#{slug}.html"
      write_jekyll_file(file_name, front_matter)
    end
  end

  def write_jekyll_file(file_name, front_matter)
    File.open(file_name, "wb") do |file|
      file.puts(front_matter.stringify_keys.to_yaml)
      file.puts("---")
    end

    log "Saved jekyll file to #{file_name}"
  end

  def local? = @local

  def log(message)
    puts(message) if @verbose
  end
end
