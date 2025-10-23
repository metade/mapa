require "nokogiri"
require "active_support/core_ext/object/blank"

class KmlDownloaderAndProcessor
  attr_reader :map_id, :property_names, :image_property_names

  def initialize(map_id:, property_names: [], image_property_names: [], local: false)
    @map_id = map_id
    @property_names = property_names
    @image_property_names = image_property_names
    @local = local

    @local_file_path = "tmp/#{map_id}.kml"
  end

  def call
    kml_data = download_kml
    parse_kml(kml_data)
  end

  private

  def download_kml
    raise "Map_id is blank" if map_id.blank?
    return File.read(@local_file_path) if local? && @local_file_path

    url = "https://www.google.com/maps/d/kml?mid=#{map_id}&forcekml=1"

    begin
      response = HTTP.timeout(30)
        .follow(max_hops: 5)
        .headers(
          "User-Agent" => "Mozilla/5.0 (compatible; Jekyll Map Downloader)",
          "Accept" => "application/vnd.google-earth.kml+xml,application/xml,text/xml,*/*"
        )
        .get(url)

      if response.code != 200
        raise "Failed to download map data (HTTP #{response.code}). Possible issues: map is not publicly accessible, invalid map ID, or network connectivity issues."
      end

      kml_data = response.body.to_s
      log "Downloaded #{kml_data.length} bytes of KML data"

      # Basic validation that we got KML content
      unless kml_data.match?(/<\?xml|<kml/i)
        raise "Downloaded content doesn't appear to be valid KML. Content preview: #{kml_data[0..200]}..."
      end

      File.write(@local_file_path, kml_data)
      log "Raw KML saved to #{@local_file_path}"

      kml_data
    rescue HTTP::Error => e
      raise "HTTP request failed: #{e.message}. This might be due to network connectivity issues, timeout, or Google Maps service issues."
    end
  end

  def parse_kml(kml_data)
    doc = Nokogiri::XML(kml_data)
    doc.remove_namespaces!

    placemarks = doc.xpath(".//Placemark")
    placemarks.map do |placemark|
      extract_feature_from_placemark(placemark)
    end
  end

  def extract_feature_from_placemark(placemark)
    name = placemark.xpath("name").text.strip
    description = placemark.xpath("description").text

    # Parse the description to extract structured data
    properties = {"nome" => name}

    # Also check ExtendedData elements
    placemark.xpath(".//Data").each do |data|
      name_attr = data.attribute("name")&.value.downcase
      value_elem = data.xpath("value").text

      next unless property_names.include?(name_attr) || image_property_names.include?(name_attr)

      if image_property_names.include?(name_attr)
        properties["imagens"] = value_elem.strip.split(/ +/)
      elsif name_attr && !value_elem.empty?
        properties[name_attr.downcase] = value_elem.strip
      end
    end

    geometry = extract_geometry_from_placemark(placemark)

    # Create GeoJSON feature
    {
      "type" => "Feature",
      "properties" => properties,
      "geometry" => geometry
    }
  end

  def extract_geometry_from_placemark(placemark)
    # Try to find Point coordinates
    if (point = placemark.xpath(".//Point/coordinates").first)
      coords_text = point.text.strip
      if coords_text && !coords_text.empty?
        # KML coordinates are in lon,lat,alt format
        coords = coords_text.split(",").map(&:to_f)
        if coords.length >= 2
          return {
            "type" => "Point",
            "coordinates" => coords[0..1]  # Only take lon, lat
          }
        end
      end
    end

    # Try to find LineString coordinates
    if (linestring = placemark.xpath(".//LineString/coordinates").first)
      coords_text = linestring.text.strip
      if coords_text && !coords_text.empty?
        coordinates = coords_text.split(/\s+/).map do |coord_set|
          coords = coord_set.split(",").map(&:to_f)
          (coords.length >= 2) ? coords[0..1] : nil
        end.compact

        if coordinates.length >= 2
          return {
            "type" => "LineString",
            "coordinates" => coordinates
          }
        end
      end
    end

    # Try to find Polygon coordinates
    if (polygon = placemark.xpath(".//Polygon").first)
      outer_boundary = polygon.xpath(".//outerBoundaryIs/LinearRing/coordinates").first
      if outer_boundary
        coords_text = outer_boundary.text.strip
        if coords_text && !coords_text.empty?
          coordinates = coords_text.split(/\s+/).map do |coord_set|
            coords = coord_set.split(",").map(&:to_f)
            (coords.length >= 2) ? coords[0..1] : nil
          end.compact

          if coordinates.length >= 4  # Polygon needs at least 4 points
            return {
              "type" => "Polygon",
              "coordinates" => [coordinates]  # Wrap in array for GeoJSON format
            }
          end
        end
      end
    end

    # No valid geometry found
    nil
  rescue => e
    log "Error extracting geometry: #{e.message}"
    nil
  end

  def local? = @local

  def log(message)
    puts message if @verbose
  end
end
