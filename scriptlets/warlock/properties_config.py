import sys
from typing import Union
import configparser
from scriptlets.warlock.base_config import *

class PropertiesConfig(BaseConfig):
	"""
	Configuration handler for Java-style .properties files
	"""

	def __init__(self, group_name: str, path: str):
		super().__init__(group_name)
		self.path = path
		self.values = {}

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
		val = self.values.get(key, default)
		return BaseConfig.convert_to_system_type(val, val_type)

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
		str_value = BaseConfig.convert_from_system_type(value, val_type)

		self.values[key] = str_value

	def has_value(self, name: str) -> bool:
		"""
		Check if a configuration option has been set

		:param name: Name of the option
		:return:
		"""
		if name not in self.options:
			return False

		key = self.options[name][1]
		return self.values.get(key, '') != ''

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
		if not os.path.exists(self.path):
			# File does not exist, nothing to load
			return

		with open(self.path, 'r') as cfgfile:
			for line in cfgfile:
				line = line.strip()
				if line == '' or line.startswith('#') or line.startswith('!'):
					# Skip empty lines and comments
					continue
				if '=' in line:
					key, value = line.split('=', 1)
					key = key.strip()
					value = value.strip()
					# Un-escape characters
					value = value.replace('\\:', ':')
					self.values[key] = value
				else:
					# Handle lines without '=' as keys with empty values
					key = line.strip()
					self.values[key] = ''

	def save(self):
		"""
		Save the configuration file back to disk
		:return:
		"""
		# Change ownership to game user if running as root
		uid = None
		gid = None
		if os.geteuid() == 0:
			# Determine game user based on parent directories
			check_path = os.path.dirname(self.path)
			while check_path != '/' and check_path != '':
				if os.path.exists(check_path):
					stat_info = os.stat(check_path)
					uid = stat_info.st_uid
					gid = stat_info.st_gid
					break
				check_path = os.path.dirname(check_path)

		# Ensure directory exists
		# This can't just be a simple os.makedirs call since we need to set ownership
		# on each created directory if running as root
		if not os.path.exists(os.path.dirname(self.path)):
			paths = os.path.dirname(self.path).split('/')
			check_path = ''
			for part in paths:
				if part == '':
					continue
				check_path += '/' + part
				if not os.path.exists(check_path):
					os.mkdir(check_path, 0o755)
					if os.geteuid() == 0 and uid is not None and gid is not None:
						os.chown(check_path, uid, gid)

		with open(self.path, 'w') as cfgfile:
			for key, value in self.values.items():
				# Escape '%' characters that may be present
				escaped_value = value.replace(':', '\\:')
				cfgfile.write(f'{key}={escaped_value}\n')

		if os.geteuid() == 0 and uid is not None and gid is not None:
			os.chown(self.path, uid, gid)



