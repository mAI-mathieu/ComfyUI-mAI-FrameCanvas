import unittest

from nodes import MAIFrameCanvasRecut


class FrameCanvasRecutLayoutTests(unittest.TestCase):
    def test_scaled_layout_dimensions_round_up(self):
        node = MAIFrameCanvasRecut()

        layout = node._get_processing_layout(
            canvas_w=999,
            canvas_h=1000,
            target_w=999,
            target_h=1000,
            x_offset=0,
            y_offset=0,
            anchor="top_left",
            processing_multiple=1,
            min_width=1,
            min_height=1,
            max_width=512,
            max_height=512,
            padding_strategy="centered",
        )

        self.assertEqual(layout["content_w"], 512)
        self.assertEqual(layout["content_h"], 512)
        self.assertEqual(layout["target_w"], 512)
        self.assertEqual(layout["target_h"], 512)

    def test_ceil_to_multiple_uses_upper_integer(self):
        node = MAIFrameCanvasRecut()

        self.assertEqual(node._ceil_to_multiple(32.1, 32), 64)

    def test_size_inputs_are_not_truncated(self):
        node = MAIFrameCanvasRecut()

        layout = node._get_processing_layout(
            canvas_w=728.1,
            canvas_h=90.1,
            target_w=512.1,
            target_h=256.1,
            x_offset=0,
            y_offset=0,
            anchor="top_left",
            processing_multiple=32,
            min_width=1,
            min_height=1,
            max_width=2048,
            max_height=2048,
            padding_strategy="pad_right_bottom",
        )

        self.assertEqual(layout["content_w"], 729)
        self.assertEqual(layout["content_h"], 91)
        self.assertEqual(layout["target_w"], 513)
        self.assertEqual(layout["target_h"], 257)


if __name__ == "__main__":
    unittest.main()
