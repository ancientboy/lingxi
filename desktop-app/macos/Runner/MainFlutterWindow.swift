import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController

    // Match Flutter shell background (#FFFFFF) before first frame paints.
    let splashBackground = NSColor.white
    flutterViewController.view.wantsLayer = true
    flutterViewController.view.layer?.backgroundColor = splashBackground.cgColor

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
    self.backgroundColor = splashBackground

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
