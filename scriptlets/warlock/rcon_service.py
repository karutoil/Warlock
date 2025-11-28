from typing import Union
from rcon.source import Client
from rcon import SessionTimeout
from rcon.exceptions import WrongPassword
from scriptlets.warlock.base_service import *


class RCONService(BaseService):
	def _api_cmd(self, cmd) -> Union[None,str]:
		"""
		Execute a raw command with RCON and return the result

		:param cmd:
		:return: None if RCON not available, or the result of the command
		"""
		if not (self.is_running() or self.is_starting() or self.is_stopping()):
			# If service is not running, don't even try to connect.
			return None

		if not self.is_api_enabled():
			# RCON is not available due to settings
			return None

		# Safety checks to ensure we have the necessary info, (regardless of is_api_enabled)
		port = self.get_api_port()
		if port is None:
			print("RCON port is not set!  Please populate get_api_port definition.", file=sys.stderr)
			return None

		password = self.get_api_password()
		if password is None:
			print("RCON password is not set!  Please populate get_api_password definition.", file=sys.stderr)
			return None

		try:
			with Client('127.0.0.1', port, passwd=password, timeout=2) as client:
				return client.run(cmd).strip()
		except Exception as e:
			print(str(e), file=sys.stderr)
			return None

	def is_api_enabled(self) -> bool:
		"""
		Check if RCON is enabled for this service
		:return:
		"""
		pass

	def get_api_port(self) -> int:
		"""
		Get the RCON port from the service configuration
		:return:
		"""
		pass

	def get_api_password(self) -> str:
		"""
		Get the RCON password from the service configuration
		:return:
		"""
		pass