
import json
import os

class JsonConfig:
    """
    Small helper class for reading the different classes from the JSON config

    :param config_path: Path to the config file, in JSON format, containing the rules (default: `../../config/config.json`)
    """
    def __init__(self, config_path='../../config/config.json'):
        #Return dictionary from the JSON configuration file
        self.config_path = os.path.abspath(config_path)
        self.config_dir  = os.path.dirname(self.config_path)

        with open(self.config_path, 'r') as file:
            self.config = json.load(file)

        #These configurations are required
        self.model_config  = self.config['model']
        self.rules_config  = self.config['rules']
        self.server_config = self.config['server']

        #Ensure that the paths defined within the model configuration is relative to the config_path
        self.model_config['path']    = self._make_path_absolute(self.model_config['path'])
        self.model_config['classes'] = self._make_path_absolute(self.model_config['classes'])

    def get_model_config(self):
        """
        Get the model configuration.
        Example format in JSON:
        "model": {
            "path": "...",
            "classes": "...",
            "confidence": ...
        }
        """
        return self.model_config

    def get_rules_config(self):
        """
        Get the ruleset configuration.
        Example format in JSON:
         "rules": [
            {
                "objects": [...],
                "action": "OPEN"
            },
            {
                "objects": [...],
                "action": "CLOSE"
            }
        ]
        """
        return self.rules_config

    def get_server_config(self):
        """
        Get the server configuration
        Example format in JSON:
        "server": {
            "port": ...
        }
        """
        return self.server_config

    def update_config(self, new_config, save_to_file=False):
        """Updates the current configuration with new values."""
        self.config.update(new_config)
        if save_to_file:
            self.save_config()

    def save_config(self):
        """Saves the current configuration to the JSON file."""
        with open(self.config_path, 'w') as file:
            json.dump(self.config, file, indent=6)

    def _make_path_absolute(self, path):
        """Convert a relative path to an absolute path based on the config file location (defined from `config_path`)."""
        if not os.path.isabs(path):
            return os.path.normpath(os.path.join(self.config_dir, path))
        return path
        