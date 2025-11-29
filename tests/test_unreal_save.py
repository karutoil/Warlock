import unittest
import tempfile
import os

from scriptlets.warlock.unreal_config import UnrealConfig


class TestUnrealConfigSave(unittest.TestCase):
    def test_save_preserves_mode_and_writes_content(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, 'test.ini')
            # Create an existing target file with a specific mode
            with open(path, 'w', encoding='utf-8') as f:
                f.write('original\n')
            os.chmod(path, 0o600)

            cfg = UnrealConfig('test', path)
            cfg._data = [[{'type': 'section', 'value': 'TestSection'},
                          {'type': 'keyvalue', 'key': 'MyKey', 'value': 'MyValue'}]]
            cfg._values = {'TestSection': {'MyKey': 'MyValue'}}
            cfg._is_changed = True

            cfg.save()

            # File content should match fetch()
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            self.assertEqual(content, cfg.fetch())

            # Mode should be preserved
            mode = os.stat(path).st_mode & 0o777
            self.assertEqual(mode, 0o600)

    def test_save_creates_new_file(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, 'new.ini')
            cfg = UnrealConfig('test', path)
            cfg._data = [[{'type': 'section', 'value': 'S'},
                          {'type': 'keyvalue', 'key': 'A', 'value': 'B'}]]
            cfg._values = {'S': {'A': 'B'}}
            cfg._is_changed = True

            cfg.save()

            self.assertTrue(os.path.exists(path))
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            self.assertEqual(content, cfg.fetch())

    def test_save_calls_chown_when_root(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, 'chown.ini')
            cfg = UnrealConfig('test', path)
            cfg._data = [[{'type': 'section', 'value': 'S'},
                          {'type': 'keyvalue', 'key': 'A', 'value': 'B'}]]
            cfg._values = {'S': {'A': 'B'}}
            cfg._is_changed = True

            # Determine expected uid/gid from the parent directory
            parent_stat = os.stat(td)
            expected_uid = parent_stat.st_uid
            expected_gid = parent_stat.st_gid

            from unittest.mock import patch
            with patch('os.geteuid', return_value=0):
                with patch('os.chown') as mock_chown:
                    cfg.save()
                    # Assert os.chown was called on the created file with expected uid/gid
                    mock_chown.assert_called()
                    # The first argument should be the path, next uid and gid
                    called_args = mock_chown.call_args[0]
                    self.assertEqual(called_args[0], cfg.path)
                    self.assertEqual(called_args[1], expected_uid)
                    self.assertEqual(called_args[2], expected_gid)


if __name__ == '__main__':
    unittest.main()
