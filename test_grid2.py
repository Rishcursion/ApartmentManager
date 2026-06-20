import sys
from PyQt6.QtWidgets import QApplication, QWidget, QGridLayout, QLabel
from PyQt6.QtCore import Qt
app = QApplication(sys.argv)
w = QWidget()
l = QGridLayout()
l.addWidget(QLabel("Test"), 0, 0, Qt.AlignmentFlag.AlignRight)
w.setLayout(l)
print("Success!")
