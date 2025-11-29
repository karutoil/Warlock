import sys
import os
here = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, os.path.join(here, '..'))

from scriptlets.warlock.base_config import BaseConfig
import unittest


first_test = '''
[SomeSection]
Key1=Value1
Key2=42
Key3=True
'''


class TestUnrealConfig(unittest.TestCase):

    def test_type_conversions(self):
        # Ensure BaseConfig conversion helpers behave as expected
        self.assertEqual(BaseConfig.convert_to_system_type('42', 'int'), 42)
        self.assertEqual(BaseConfig.convert_to_system_type('True', 'bool'), True)
        self.assertEqual(BaseConfig.convert_to_system_type('some', 'str'), 'some')

        self.assertEqual(BaseConfig.convert_from_system_type(True, 'bool'), 'True')
        self.assertEqual(BaseConfig.convert_from_system_type(False, 'bool'), 'False')
        self.assertEqual(BaseConfig.convert_from_system_type(5, 'int'), '5')


if __name__ == '__main__':
    unittest.main()
