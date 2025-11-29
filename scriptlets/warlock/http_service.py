import json
import base64
from typing import Union
from urllib import request
from scriptlets.warlock.base_service import *


class HTTPService(BaseService):

	def __init__(self, service: str, game: BaseApp):
		super().__init__(service, game)

	def _api_cmd(self, cmd: str, method: str = 'GET', data: dict = None):
		method = method.upper()

		if not (self.is_running() or self.is_starting() or self.is_stopping()):
			# If service is not running, don't even try to connect.
			return None

		if not self.is_api_enabled():
			# No REST API enabled, unable to retrieve any data
			return None

		headers = {
			'Content-Type': 'application/json; charset=utf-8',
			'Accept': 'application/json',
		}

		# Some games require authentication for HTTP access, so tap in a Basic auth if present.
		password = self.get_api_password()
		username = self.get_api_username()
		if password is not None and password != '':
			if username is not None and username != '':
				# Basic Auth
				credentials = ('%s:%s' % (username, password)).encode('utf-8')
				base64_credentials = base64.b64encode(credentials).decode('ascii')
				headers['Authorization'] = 'Basic %s' % base64_credentials
			else:
				# Bearer Token Auth
				headers['Authorization'] = 'Bearer %s' % password

		req = request.Request(
			'http://127.0.0.1:%s%s' % (str(self.get_api_port()), cmd),
			headers=headers,
			method=method
		)
		try:
			if method == 'POST' and data is not None:
				data = bytearray(json.dumps(data), 'utf-8')
				req.add_header('Content-Length', str(len(data)))
				with request.urlopen(req, data, timeout=2) as resp:
					ret = resp.read().decode('utf-8')
					if ret == '':
						return None
					else:
						return json.loads(ret)
			else:
				with request.urlopen(req, timeout=2) as resp:
					ret = resp.read().decode('utf-8')
					if ret == '':
						return None
					else:
						return json.loads(ret)
		except Exception as e:
			print(str(e), file=sys.stderr)
			return None

	def is_api_enabled(self) -> bool:
		"""
		Check if HTTP API is enabled for this service
		:return:
		"""
		pass

	def get_api_port(self) -> int:
		"""
		Get the HTTP API port from the service configuration
		:return:
		"""
		pass

	def get_api_password(self) -> str:
		"""
		Get the API password from the service configuration
		:return:
		"""
		pass

	def get_api_username(self) -> str:
		"""
		Get the API username from the service configuration
		:return:
		"""
		pass
