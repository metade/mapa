require "csv"
require "active_support/core_ext/object/blank"
require "http"
require "base64"

class CsvDownloaderAndProcessor
  attr_reader :csv_url, :csv_col_sep, :config

  def initialize(csv_url:, csv_col_sep: ";", config: {}, local: false, verbose: false)
    @csv_url = csv_url
    @csv_col_sep = csv_col_sep
    @config = config
    @local = local
    @verbose = verbose

    csv_url_key = Base64.urlsafe_encode64(csv_url)
    @local_file_path = "tmp/#{csv_url_key}.csv"
  end

  def call
    download_csv

    CSV.foreach(@local_file_path, headers: true, col_sep: csv_col_sep).map do |row|
      properties = row.to_h.slice(*config[:property_names])
      properties["slug"] = row[config[:slug]]
      properties["imagens"] = row.to_h.slice(*config[:image_property_names]).values

      {
        "type" => "Feature",
        "properties" => properties,
        "geometry" => {
          "type" => "Point",
          "coordinates" => [
            row[config[:longitude]].to_f,
            row[config[:latitude]].to_f
          ]
        }
      }
    end
  end

  private

  def download_csv
    raise "csv_url is blank" if csv_url.blank?
    return File.read(@local_file_path) if local? && File.exist?(@local_file_path)

    response = HTTP.timeout(30).follow(max_hops: 5).get(csv_url)
    if response.status.success?
      File.open(@local_file_path, "wb") { |file| file.puts(response.body) }
    end
  end

  def process_row(hash)
    raise hash.inspect
  end

  def local? = @local
end
