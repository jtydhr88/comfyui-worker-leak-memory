"""
comfyui-worker-leak-memory — minimal reproduction of a ComfyUI extension-loading
failure mode: every .js file under WEB_DIRECTORY is imported into the page,
including Web Worker scripts that were never meant to run there.

Installing this plugin is safe. The leak is opt-in and must be armed from the
demo panel; nothing loops on load.
"""

WEB_DIRECTORY = "./js"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
