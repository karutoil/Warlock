import sys
from typing import Union
import json
from scriptlets.warlock.base_config import *


class JSONConfig(BaseConfig):
	def __init__(self, group_name: str, path: str):
		super().__init__(group_name)
		self.path = path
		self.group = group_name
		self.data = {}

	def get_value(self, name: str) -> Union[str, int, bool]:
		"""
		Get a configuration option from the config

		:param name: Name of the option
		:return:
		"""
		if name not in self.options:
			print('Invalid option: %s, not present in %s configuration!' % (name, os.path.basename(self.path)), file=sys.stderr)
			return ''

		key = self.options[name][1]
		default = self.options[name][2]
		val_type = self.options[name][3]

		lookup = self.data
		if key.startswith('/'):
			key = key[1:]
		for part in key.split('/'):
			if part in lookup:
				lookup = lookup[part]
			else:
				lookup = default
				break

		return BaseConfig.convert_to_system_type(lookup, val_type)

	def set_value(self, name: str, value: Union[str, int, bool]):
		"""
		Set a configuration option in the config

		:param name: Name of the option
		:param value: Value to save
		:return:
		"""
		if name not in self.options:
			print('Invalid option: %s, not present in %s configuration!' % (name, os.path.basename(self.path)), file=sys.stderr)
			return

		key = self.options[name][1]
		val_type = self.options[name][3]

		# JSON files can store native types, so convert value accordingly
		value = BaseConfig.convert_to_system_type(value, val_type)

		if key.startswith('/'):
			key = key[1:]
		lookup = self.data
		parts = key.split('/')
		counter = 0
		for part in parts:
			counter += 1

			if counter == len(parts):
				lookup[part] = value
			else:
				if part not in lookup:
					lookup[part] = {}
				lookup = lookup[part]

	def has_value(self, name: str) -> bool:
		"""
		Check if a configuration option has been set

		:param name: Name of the option
		:return:
		"""
		if name not in self.options:
			return False

		key = self.options[name][1]

		lookup = self.data
		if key.startswith('/'):
			key = key[1:]
		for part in key.split('/'):
			if part in lookup:
				lookup = lookup[part]
			else:
				return False

		return lookup != ''

	def exists(self) -> bool:
		"""
		Check if the config file exists on disk
		:return:
		"""
		return os.path.exists(self.path)

	def load(self):
		"""
		Load the configuration file from disk
		:return:
		"""
		if os.path.exists(self.path):
			with open(self.path, 'r') as f:
				self.data = json.load(f)

	def save(self):
		"""
		Save the configuration file back to disk
		:return:
		"""
		with open(self.path, 'w') as f:
			json.dump(self.data, f, indent=4)

		# Change ownership to game user if running as root
		if os.geteuid() == 0:
			# Determine game user based on parent directories
			check_path = os.path.dirname(self.path)
			while check_path != '/' and check_path != '':
				if os.path.exists(check_path):
					stat_info = os.stat(check_path)
					uid = stat_info.st_uid
					gid = stat_info.st_gid
					os.chown(self.path, uid, gid)
					break
				check_path = os.path.dirname(check_path)
