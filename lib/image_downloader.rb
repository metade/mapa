#!/usr/bin/env ruby

require "http"
require "uri"
require "digest"
require "fileutils"
require "mini_magick"

class ImageDownloader
  # Image processing configuration
  MAX_IMAGE_WIDTH = 1200
  MAX_IMAGE_HEIGHT = 800
  JPEG_QUALITY = 85

  attr_reader :images_dir, :downloaded_images

  def initialize(images_dir:, verbose: false)
    @images_dir = images_dir
    @verbose = verbose
    @downloaded_images = {}

    # Ensure images directory exists
    FileUtils.mkdir_p(@images_dir)
  end

  def download_image(url)
    return nil unless url.match?(/^https?:\/\//)

    # Create a unique filename based on URL hash
    url_hash = Digest::MD5.hexdigest(url)[0..8]
    extension = extract_file_extension(url)
    filename = "#{url_hash}#{extension}"
    local_path = File.join(@images_dir, filename)
    image_url_path = "/#{local_path}"

    # Skip if already downloaded
    if @downloaded_images[url]
      return @downloaded_images[url]
    end

    # Skip if file already exists (check both original extension and .jpg)
    jpeg_filename = filename.gsub(/\.\w+$/, ".jpg")
    jpeg_local_path = File.join(@images_dir, jpeg_filename)
    jpeg_image_url_path = "/#{jpeg_local_path}"

    if File.exist?(local_path)
      log "Image already exists: #{filename}"
      @downloaded_images[url] = image_url_path
      return image_url_path
    elsif File.exist?(jpeg_local_path)
      log "Image already exists (as JPEG): #{jpeg_filename}"
      @downloaded_images[url] = jpeg_image_url_path
      return jpeg_image_url_path
    end

    log "Downloading image: #{url} -> #{filename}"

    response = HTTP.timeout(30)
      .follow(max_hops: 3)
      .headers(
        "User-Agent" => "Mozilla/5.0 (compatible; Jekyll Map Downloader)",
        "Accept" => "image/*,*/*"
      )
      .get(url)

    if response.code == 200
      # Validate it's actually an image
      content_type = response.headers["Content-Type"].to_s
      unless content_type.start_with?("image/")
        log "Warning: #{url} doesn't appear to be an image (Content-Type: #{content_type})"
      end

      # Write original image to temporary file
      temp_path = "#{local_path}.tmp"
      body_content = response.body.to_s
      File.write(temp_path, body_content)

      # Process image for web optimization
      begin
        image = MiniMagick::Image.open(temp_path)
        original_size = image.size

        # Resize if too large
        if image.width > MAX_IMAGE_WIDTH || image.height > MAX_IMAGE_HEIGHT
          image.resize "#{MAX_IMAGE_WIDTH}x#{MAX_IMAGE_HEIGHT}>"
          log "Resized image from #{original_size[0]}x#{original_size[1]} to #{image.width}x#{image.height}"
        end

        # Set quality for JPEG compression
        image.quality JPEG_QUALITY

        # Convert to JPEG if it's not already (for better compression)
        if image.type != "JPEG"
          # Update filename extension to .jpg
          new_filename = filename.gsub(/\.\w+$/, ".jpg")
          new_local_path = File.join(@images_dir, new_filename)
          new_image_url_path = "/#{new_local_path}"

          image.format "jpeg"
          image.write(new_local_path)

          # Clean up temp file
          File.delete(temp_path) if File.exist?(temp_path)

          @downloaded_images[url] = new_image_url_path
          log "Successfully processed and converted: #{new_filename} (#{format_file_size(File.size(new_local_path))})"
          new_image_url_path
        else
          image.write(local_path)

          # Clean up temp file
          File.delete(temp_path) if File.exist?(temp_path)

          @downloaded_images[url] = image_url_path
          log "Successfully processed: #{filename} (#{format_file_size(File.size(local_path))})"
          image_url_path
        end
      rescue MiniMagick::Error => e
        log "Failed to process image #{filename}: #{e.message}. Saving original."
        # Fallback: save original if processing fails
        File.rename(temp_path, local_path) if File.exist?(temp_path)
        @downloaded_images[url] = image_url_path
        log "Successfully downloaded (unprocessed): #{filename} (#{format_file_size(body_content.length)})"
        image_url_path
      end
    else
      log "Failed to download #{url}: HTTP #{response.code}"
      nil
    end
  rescue => e
    log "Error downloading #{url}: #{e.message}"
    nil
  end

  def download_images(urls)
    log "Processing #{urls.length} image URLs..."
    downloaded_paths = []

    urls.each do |url|
      local_path = download_image(url)
      downloaded_paths << local_path if local_path
    rescue => e
      log "Failed to download image #{url}: #{e.message}"
    end

    log "Downloaded #{downloaded_paths.length}/#{urls.length} images to #{@images_dir}/"
    downloaded_paths
  end

  private

  def log(message)
    puts "[#{Time.now.strftime("%H:%M:%S")}] #{message}" if @verbose
  end

  def extract_file_extension(url)
    # Try to get extension from URL path
    uri = URI.parse(url)
    path = uri.path.to_s

    # Common image extensions
    if path.match?(/\.(jpe?g|png|gif|webp|bmp|svg)$/i)
      extension = path.match(/(\.[^.]+)$/)[1].downcase
      return extension
    end

    # Default to .jpg if no extension found
    ".jpg"
  rescue
    ".jpg"
  end

  def format_file_size(bytes)
    return "0 B" if bytes == 0

    units = ["B", "KB", "MB", "GB"]
    size = bytes.to_f
    unit_index = 0

    while size >= 1024 && unit_index < units.length - 1
      size /= 1024.0
      unit_index += 1
    end

    "%.1f %s" % [size, units[unit_index]]
  end
end
