class Plugin {
    constructor(name) {
        if (new.target === Plugin) {
            throw new TypeError("Cannot construct Plugin instances directly");
        }
        this.name = name;
    }
    init(app) {
        throw new Error("init() must be implemented by the plugin subclass");
    }
}

class MyPlugin extends Plugin {
    constructor() {
        super("MyPlugin");
    }

    init(app) {
        console.log(`Initializing plugin: ${this.name}`);
        // Plugin-specific initialization logic goes here
    }
}

// Plugin manager to control loading
class PluginManager {
    constructor(app) {
        this.app = app;
    }

    loadPlugin(PluginClass) {
        const plugin = new PluginClass();
        plugin.init(this.app);
        console.log(`Loaded plugin: ${plugin.name}`);
    }
}

// Example usage
const app = {}; // Simulated application object
const pluginManager = new PluginManager(app);

// Control when to load plugins:
pluginManager.loadPlugin(MyPlugin);
// You can load more plugins later as needed

