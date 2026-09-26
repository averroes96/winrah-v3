import AppKit

let projectRoot = FileManager.default.currentDirectoryPath
let sourcePath = "\(projectRoot)/public/app-icon.jpg"

guard let sourceImage = NSImage(contentsOfFile: sourcePath) else {
    print("❌ Failed to load source image at: \(sourcePath)")
    exit(1)
}

let bgColor = NSColor(calibratedRed: 33.0/255.0, green: 45.0/255.0, blue: 59.0/255.0, alpha: 1.0) // #212D3B

func renderImage(size: CGSize, drawBlock: (CGContext, CGSize) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(size.width),
        pixelsHigh: Int(size.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    rep.size = size

    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    context.imageInterpolation = .high
    NSGraphicsContext.current = context

    let cgContext = context.cgContext
    drawBlock(cgContext, size)

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func savePNG(rep: NSBitmapImageRep, to path: String) {
    let url = URL(fileURLWithPath: path)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let data = rep.representation(using: .png, properties: [:]) {
        try? data.write(to: url)
        print("✅ Wrote: \(path)")
    } else {
        print("❌ Failed writing: \(path)")
    }
}

print("🎨 1. Generating iOS AppIcon (1024x1024)...")
let iosAppIcon = renderImage(size: CGSize(width: 1024, height: 1024)) { cg, size in
    // Opaque background + full source image
    cg.setFillColor(bgColor.cgColor)
    cg.fill(CGRect(origin: .zero, size: size))
    sourceImage.draw(in: CGRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1.0)
}
savePNG(rep: iosAppIcon, to: "\(projectRoot)/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

print("🎨 2. Generating Android Adaptive Foreground Icons (108dp canvas, logo scaled to ~72dp safe area)...")
let foregroundSizes: [(folder: String, size: CGFloat)] = [
    ("mipmap-mdpi", 108),
    ("mipmap-hdpi", 162),
    ("mipmap-xhdpi", 216),
    ("mipmap-xxhdpi", 324),
    ("mipmap-xxxhdpi", 432)
]

for (folder, dim) in foregroundSizes {
    let rep = renderImage(size: CGSize(width: dim, height: dim)) { cg, size in
        // Fill full canvas with dark background
        cg.setFillColor(bgColor.cgColor)
        cg.fill(CGRect(origin: .zero, size: size))
        
        // Draw logo in central 72% safe zone
        let logoDim = dim * 0.72
        let origin = (dim - logoDim) / 2.0
        let rect = CGRect(x: origin, y: origin, width: logoDim, height: logoDim)
        sourceImage.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1.0)
    }
    savePNG(rep: rep, to: "\(projectRoot)/android/app/src/main/res/\(folder)/ic_launcher_foreground.png")
}

print("🎨 3. Generating Android Legacy Launcher Icons (Square & Round)...")
let legacySizes: [(folder: String, size: CGFloat)] = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192)
]

for (folder, dim) in legacySizes {
    // Square
    let squareRep = renderImage(size: CGSize(width: dim, height: dim)) { cg, size in
        cg.setFillColor(bgColor.cgColor)
        cg.fill(CGRect(origin: .zero, size: size))
        sourceImage.draw(in: CGRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1.0)
    }
    savePNG(rep: squareRep, to: "\(projectRoot)/android/app/src/main/res/\(folder)/ic_launcher.png")

    // Round (Circular clip)
    let roundRep = renderImage(size: CGSize(width: dim, height: dim)) { cg, size in
        cg.addEllipse(in: CGRect(origin: .zero, size: size))
        cg.clip()
        cg.setFillColor(bgColor.cgColor)
        cg.fill(CGRect(origin: .zero, size: size))
        sourceImage.draw(in: CGRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1.0)
    }
    savePNG(rep: roundRep, to: "\(projectRoot)/android/app/src/main/res/\(folder)/ic_launcher_round.png")
}

print("🎨 4. Generating Branded Splash Screens (Android & iOS)...")
let androidSplashSizes: [(path: String, w: CGFloat, h: CGFloat)] = [
    ("android/app/src/main/res/drawable/splash.png", 480, 320),
    ("android/app/src/main/res/drawable-port-mdpi/splash.png", 320, 480),
    ("android/app/src/main/res/drawable-port-hdpi/splash.png", 480, 800),
    ("android/app/src/main/res/drawable-port-xhdpi/splash.png", 720, 1280),
    ("android/app/src/main/res/drawable-port-xxhdpi/splash.png", 960, 1600),
    ("android/app/src/main/res/drawable-port-xxxhdpi/splash.png", 1280, 1920),
    ("android/app/src/main/res/drawable-land-mdpi/splash.png", 480, 320),
    ("android/app/src/main/res/drawable-land-hdpi/splash.png", 800, 480),
    ("android/app/src/main/res/drawable-land-xhdpi/splash.png", 1280, 720),
    ("android/app/src/main/res/drawable-land-xxhdpi/splash.png", 1600, 960),
    ("android/app/src/main/res/drawable-land-xxxhdpi/splash.png", 1920, 1280)
]

for item in androidSplashSizes {
    let rep = renderImage(size: CGSize(width: item.w, height: item.h)) { cg, size in
        cg.setFillColor(bgColor.cgColor)
        cg.fill(CGRect(origin: .zero, size: size))
        let minDim = min(size.width, size.height)
        let logoDim = min(minDim * 0.45, 320)
        let x = (size.width - logoDim) / 2.0
        let y = (size.height - logoDim) / 2.0
        sourceImage.draw(in: CGRect(x: x, y: y, width: logoDim, height: logoDim), from: .zero, operation: .sourceOver, fraction: 1.0)
    }
    savePNG(rep: rep, to: "\(projectRoot)/\(item.path)")
}

let iosSplashFiles = [
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png"
]

for path in iosSplashFiles {
    let rep = renderImage(size: CGSize(width: 2732, height: 2732)) { cg, size in
        cg.setFillColor(bgColor.cgColor)
        cg.fill(CGRect(origin: .zero, size: size))
        let logoDim: CGFloat = 640
        let x = (size.width - logoDim) / 2.0
        let y = (size.height - logoDim) / 2.0
        sourceImage.draw(in: CGRect(x: x, y: y, width: logoDim, height: logoDim), from: .zero, operation: .sourceOver, fraction: 1.0)
    }
    savePNG(rep: rep, to: "\(projectRoot)/\(path)")
}

print("🎉 ALL MOBILE ASSETS GENERATED SUCCESSFULLY!")
