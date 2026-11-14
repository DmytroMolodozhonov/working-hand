"""hw_info.py: the names of the processor and the graphics cards (the author 14.11: «Нейросеть считает на…» names the real hardware).
Run: python3 -m unittest discover -s tests/python"""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import hw_info  # noqa: E402


class HwInfo(unittest.TestCase):
    def test_clean_cpu_names(self):
        self.assertEqual(hw_info.clean_name("Intel(R) Core(TM) i5-12400F CPU @ 2.50GHz"), "Intel Core i5-12400F")
        self.assertEqual(hw_info.clean_name("AMD Ryzen 5 5600 6-Core Processor"), "AMD Ryzen 5 5600")
        self.assertEqual(hw_info.clean_name(""), "")

    def test_parse_cards_drops_virtual_header_and_duplicates(self):
        text = "Name\r\nNVIDIA GeForce RTX 3050 Laptop GPU\r\nIntel(R) Iris(R) Xe Graphics\r\nMicrosoft Basic Display Adapter\r\nParsec Virtual Display Adapter\r\nNVIDIA GeForce RTX 3050 Laptop GPU\r\n\r\n"
        self.assertEqual(hw_info.parse_cards(text), ["NVIDIA GeForce RTX 3050 Laptop GPU", "Intel Iris Xe Graphics"])

    def test_parse_lspci(self):
        t = ("00:02.0 VGA compatible controller: Intel Corporation Alder Lake-P GT2 [Iris Xe Graphics] (rev 0c)\n"
             "01:00.0 3D controller: NVIDIA Corporation GA107M [GeForce RTX 3050 Mobile] (rev a1)\n"
             "00:1f.3 Audio device: Intel Corporation x\n")
        self.assertEqual(hw_info.parse_lspci(t), ["Iris Xe Graphics", "GeForce RTX 3050 Mobile"])

    def test_hardware_has_the_keys_and_never_raises(self):
        hw = hw_info.hardware()
        self.assertEqual(set(hw), {"cpu", "gpus", "cores"})
        self.assertIsInstance(hw["gpus"], list)
        self.assertIsInstance(hw["cpu"], str)


if __name__ == "__main__":
    unittest.main()
