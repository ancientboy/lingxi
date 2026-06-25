import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController

    // Match Flutter splash background (#FAFAF9) before first frame paints.
    flutterViewController.view.wantsLayer = true
    flutterViewController.view.layer?.backgroundColor = NSColor(
      red: 250.0 / 255.0,
      green: 250.0 / 255.0,
      blue: 249.0 / 255.0,
      alpha: 1.0
    )

    let defaultSize = NSSize(width: 1200, height: 800)
    if let screenFrame = NSScreen.main?.visibleFrame {
      let originX = screenFrame.origin.x + (screenFrame.width - defaultSize.width) / 2
      let originY = screenFrame.origin.y + (screenFrame.height - defaultSize.height) / 2
      self.setFrame(
        NSRect(x: originX, y: originY, width: defaultSize.width, height: defaultSize.height),
        display: true
      )
    }

    self.minSize = NSSize(width: 900, height: 620)
    self.title = "Lume"
    self.backgroundColor = NSColor(
      red: 250.0 / 255.0,
      green: 250.0 / 255.0,
      blue: 249.0 / 255.0,
      alpha: 1.0
    )

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
