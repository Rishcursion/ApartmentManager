import sys
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                             QTabWidget, QLabel, QLineEdit, QPushButton, QTableWidget,
                             QTableWidgetItem, QComboBox, QMessageBox, QHeaderView, QDateEdit,
                             QFormLayout, QFileDialog, QGroupBox, QAbstractItemView, QGridLayout)
from PyQt6.QtCore import Qt, QDate

from database import init_db, execute_query, fetch_query
from utils import export_to_excel, generate_receipt

# Stylesheet designed for readability and large clickable areas
STYLESHEET = """
    QWidget {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 14pt;
    }
    QLabel {
        color: #333333;
    }
    QPushButton {
        background-color: #005A9E;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-weight: bold;
        border: none;
    }
    QPushButton:hover {
        background-color: #004578;
    }
    QPushButton#actionBtn {
        background-color: #107C41; /* Excel/Green */
    }
    QPushButton#actionBtn:hover {
        background-color: #0B5A2F;
    }
    QPushButton#dangerBtn {
        background-color: #D83B01; /* Red/Orange for Dues */
    }
    QPushButton#dangerBtn:hover {
        background-color: #A42600;
    }
    QLineEdit, QComboBox, QDateEdit {
        padding: 10px;
        border: 2px solid #CCCCCC;
        border-radius: 4px;
        background-color: #FFFFFF;
    }
    QLineEdit:focus, QComboBox:focus, QDateEdit:focus {
        border: 2px solid #005A9E;
    }
    QTableWidget {
        gridline-color: #DDDDDD;
        font-size: 12pt;
        alternate-background-color: #F9F9F9;
    }
    QHeaderView::section {
        background-color: #EBEBEB;
        padding: 10px;
        border: 1px solid #CCCCCC;
        font-weight: bold;
        font-size: 13pt;
    }
    QGroupBox {
        font-weight: bold;
        border: 2px solid #005A9E;
        border-radius: 8px;
        margin-top: 20px;
        padding-top: 15px;
    }
    QGroupBox::title {
        subcontrol-origin: margin;
        subcontrol-position: top center;
        padding: 0 10px;
        color: #005A9E;
        font-size: 16pt;
    }
    QTabWidget::pane {
        border: 1px solid #CCCCCC;
        border-radius: 4px;
    }
    QTabBar::tab {
        background: #EBEBEB;
        padding: 12px 25px;
        margin-right: 2px;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
        font-weight: bold;
    }
    QTabBar::tab:selected {
        background: #FFFFFF;
        border-bottom-color: #FFFFFF;
        color: #005A9E;
    }
"""

def create_search_bar(table_widget):
    search_bar = QLineEdit()
    search_bar.setPlaceholderText("Type here to search and filter data...")
    search_bar.textChanged.connect(lambda text: filter_table(table_widget, text))
    return search_bar

def filter_table(table, text):
    text = text.lower()
    for row in range(table.rowCount()):
        match = False
        for col in range(table.columnCount()):
            item = table.item(row, col)
            if item and text in item.text().lower():
                match = True
                break
        table.setRowHidden(row, not match)

class FlatsTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: Register a new apartment or update an existing one here. Phone numbers are optional.")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        # Form for adding flat
        form_layout = QHBoxLayout()
        
        col1 = QVBoxLayout()
        self.flat_no_input = QLineEdit(placeholderText="Flat Number (e.g. 101)")
        self.status_combo = QComboBox()
        self.status_combo.addItems(["Occupied by Owner", "Occupied by Tenant", "Vacant"])
        self.status_combo.currentTextChanged.connect(self.toggle_tenant_input)
        col1.addWidget(self.flat_no_input)
        col1.addWidget(self.status_combo)
        
        col2 = QVBoxLayout()
        self.owner_input = QLineEdit(placeholderText="Owner Full Name")
        self.owner_phone_input = QLineEdit(placeholderText="Owner Phone No.")
        col2.addWidget(self.owner_input)
        col2.addWidget(self.owner_phone_input)
        
        col3 = QVBoxLayout()
        self.tenant_input = QLineEdit(placeholderText="Tenant Name")
        self.tenant_phone_input = QLineEdit(placeholderText="Tenant Phone No.")
        col3.addWidget(self.tenant_input)
        col3.addWidget(self.tenant_phone_input)
        
        form_layout.addLayout(col1)
        form_layout.addLayout(col2)
        form_layout.addLayout(col3)
        
        btn_layout = QHBoxLayout()
        add_btn = QPushButton("Save Flat Details")
        add_btn.setObjectName("actionBtn")
        add_btn.clicked.connect(self.add_flat)
        import_btn = QPushButton("Bulk Import (CSV)")
        import_btn.clicked.connect(self.import_csv)
        btn_layout.addWidget(add_btn)
        btn_layout.addWidget(import_btn)
        
        layout.addLayout(form_layout)
        layout.addLayout(btn_layout)
        
        # Table to view flats
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels(["Flat Number", "Owner Name", "Owner Phone", "Tenant Name", "Tenant Phone", "Occupancy Status"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        
        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel("Filter:"))
        self.search_bar = create_search_bar(self.table)
        search_layout.addWidget(self.search_bar)
        
        layout.addLayout(search_layout)
        layout.addWidget(self.table)
        self.setLayout(layout)
        
        self.toggle_tenant_input()
        self.load_flats()
        
    def toggle_tenant_input(self):
        if self.status_combo.currentText() == "Occupied by Tenant":
            self.tenant_input.show()
            self.tenant_phone_input.show()
        else:
            self.tenant_input.hide()
            self.tenant_input.clear()
            self.tenant_phone_input.hide()
            self.tenant_phone_input.clear()
            
    def add_flat(self):
        flat_no = self.flat_no_input.text().strip()
        if not flat_no:
            QMessageBox.warning(self, "Missing Information", "Please enter the Flat Number.")
            return
            
        owner = self.owner_input.text().strip()
        o_phone = self.owner_phone_input.text().strip()
        tenant = self.tenant_input.text().strip()
        t_phone = self.tenant_phone_input.text().strip()
        status = self.status_combo.currentText()
        
        execute_query('''
            INSERT INTO flats (flat_no, owner_name, owner_phone, tenant_name, tenant_phone, occupancy_status)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(flat_no) DO UPDATE SET
            owner_name=excluded.owner_name,
            owner_phone=excluded.owner_phone,
            tenant_name=excluded.tenant_name,
            tenant_phone=excluded.tenant_phone,
            occupancy_status=excluded.occupancy_status
        ''', (flat_no, owner, o_phone, tenant, t_phone, status))
        
        self.load_flats()
        self.flat_no_input.clear()
        self.owner_input.clear()
        self.owner_phone_input.clear()
        self.tenant_input.clear()
        self.tenant_phone_input.clear()
        QMessageBox.information(self, "Success", f"Flat {flat_no} saved successfully.")
        
    def import_csv(self):
        filename, _ = QFileDialog.getOpenFileName(self, "Select CSV File", "", "CSV Files (*.csv)")
        if not filename:
            return
            
        try:
            import pandas as pd
            df = pd.read_csv(filename)
            
            # Check for required columns
            required_cols = ["Flat Number", "Owner Name", "Tenant Name", "Occupancy Status"]
            for col in required_cols:
                if col not in df.columns:
                    QMessageBox.warning(self, "Invalid Format", f"CSV is missing the required column: '{col}'\nPlease ensure columns are: {', '.join(required_cols)}")
                    return
            
            count = 0
            for index, row in df.iterrows():
                flat_no = str(row["Flat Number"]).strip()
                if not flat_no or flat_no == 'nan':
                    continue
                    
                owner = str(row["Owner Name"]).strip() if pd.notna(row["Owner Name"]) else ""
                tenant = str(row["Tenant Name"]).strip() if pd.notna(row["Tenant Name"]) else ""
                status = str(row["Occupancy Status"]).strip() if pd.notna(row["Occupancy Status"]) else "Occupied by Owner"
                
                # Optionals
                o_phone = str(row["Owner Phone"]).strip() if "Owner Phone" in df.columns and pd.notna(row["Owner Phone"]) else ""
                t_phone = str(row["Tenant Phone"]).strip() if "Tenant Phone" in df.columns and pd.notna(row["Tenant Phone"]) else ""
                
                if status not in ["Occupied by Owner", "Occupied by Tenant", "Vacant"]:
                    status = "Occupied by Owner"
                    
                execute_query('''
                    INSERT INTO flats (flat_no, owner_name, owner_phone, tenant_name, tenant_phone, occupancy_status)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(flat_no) DO UPDATE SET
                    owner_name=excluded.owner_name,
                    owner_phone=excluded.owner_phone,
                    tenant_name=excluded.tenant_name,
                    tenant_phone=excluded.tenant_phone,
                    occupancy_status=excluded.occupancy_status
                ''', (flat_no, owner, o_phone, tenant, t_phone, status))
                count += 1
                
            self.load_flats()
            QMessageBox.information(self, "Success", f"Successfully imported/updated {count} apartments from CSV.")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to import CSV: {str(e)}")
            
    def load_flats(self):
        self.table.setRowCount(0)
        flats = fetch_query("SELECT * FROM flats")
        for row, flat in enumerate(flats):
            f_dict = dict(flat)
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(f_dict['flat_no']))
            self.table.setItem(row, 1, QTableWidgetItem(f_dict['owner_name']))
            self.table.setItem(row, 2, QTableWidgetItem(f_dict.get('owner_phone', '') or ''))
            
            tenant_display = f_dict['tenant_name'] or '' if f_dict['occupancy_status'] == 'Occupied by Tenant' else "-"
            t_phone_display = f_dict.get('tenant_phone', '') or '' if f_dict['occupancy_status'] == 'Occupied by Tenant' else "-"
            
            self.table.setItem(row, 3, QTableWidgetItem(tenant_display))
            self.table.setItem(row, 4, QTableWidgetItem(t_phone_display))
            self.table.setItem(row, 5, QTableWidgetItem(f_dict['occupancy_status']))

class CategoriesTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: Add or view the different types of charges (like Maintenance, Water Bill).")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        form_layout = QHBoxLayout()
        self.name_input = QLineEdit(placeholderText="New Category Name (e.g. Festival Fund)")
        add_btn = QPushButton("Add New Category")
        info_label = QLabel("Instruction: Manage categories for both Resident Dues and Society Expenses here.")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        # --- Dues Categories ---
        due_group = QGroupBox("1. Resident Due Categories (Incomes)")
        due_layout = QHBoxLayout()
        
        self.due_table = QTableWidget()
        self.due_table.setAlternatingRowColors(True)
        self.due_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.due_table.setColumnCount(2)
        self.due_table.setHorizontalHeaderLabels(["ID", "Category Name"])
        self.due_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        due_layout.addWidget(self.due_table)
        
        due_form = QVBoxLayout()
        self.due_cat_input = QLineEdit(placeholderText="e.g. Festival Fund")
        btn_add_due = QPushButton("Add Due Category")
        btn_add_due.setObjectName("actionBtn")
        btn_add_due.clicked.connect(self.add_due_category)
        
        due_form.addWidget(QLabel("New Due Category Name:"))
        due_form.addWidget(self.due_cat_input)
        due_form.addWidget(btn_add_due)
        due_form.addStretch()
        
        due_layout.addLayout(due_form)
        due_group.setLayout(due_layout)
        
        # --- Expense Categories ---
        exp_group = QGroupBox("2. Society Expense Categories (Outgoings)")
        exp_layout = QHBoxLayout()
        
        self.exp_table = QTableWidget()
        self.exp_table.setAlternatingRowColors(True)
        self.exp_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.exp_table.setColumnCount(2)
        self.exp_table.setHorizontalHeaderLabels(["ID", "Expense Category Name"])
        self.exp_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        exp_layout.addWidget(self.exp_table)
        
        exp_form = QVBoxLayout()
        self.exp_cat_input = QLineEdit(placeholderText="e.g. Festival Decorations")
        btn_add_exp = QPushButton("Add Expense Category")
        btn_add_exp.setObjectName("actionBtn")
        btn_add_exp.clicked.connect(self.add_exp_category)
        
        exp_form.addWidget(QLabel("New Expense Category Name:"))
        exp_form.addWidget(self.exp_cat_input)
        exp_form.addWidget(btn_add_exp)
        
        exp_form.addSpacing(20)
        exp_form.addWidget(QLabel("Delete Expense Category:"))
        self.del_exp_combo = QComboBox()
        btn_del_exp = QPushButton("Delete")
        btn_del_exp.setObjectName("dangerBtn")
        btn_del_exp.clicked.connect(self.delete_exp_category)
        
        exp_form.addWidget(self.del_exp_combo)
        exp_form.addWidget(btn_del_exp)
        exp_form.addStretch()
        
        exp_layout.addLayout(exp_form)
        exp_group.setLayout(exp_layout)
        
        layout.addWidget(due_group)
        layout.addWidget(exp_group)
        
        self.setLayout(layout)
        self.load_due_categories()
        self.load_exp_categories()

    def load_due_categories(self):
        cats = fetch_query("SELECT * FROM categories")
        self.due_table.setRowCount(0)
        for row, cat in enumerate(cats):
            self.due_table.insertRow(row)
            self.due_table.setItem(row, 0, QTableWidgetItem(str(cat['id'])))
            self.due_table.setItem(row, 1, QTableWidgetItem(cat['name']))
            
    def add_due_category(self):
        name = self.due_cat_input.text().strip()
        if not name: return
        try:
            execute_query("INSERT INTO categories (name) VALUES (?)", (name,))
            self.due_cat_input.clear()
            self.load_due_categories()
        except Exception:
            QMessageBox.warning(self, "Error", "Category already exists.")

    def load_exp_categories(self):
        cats = fetch_query("SELECT * FROM expense_categories ORDER BY name ASC")
        self.exp_table.setRowCount(0)
        self.del_exp_combo.blockSignals(True)
        self.del_exp_combo.clear()
        
        for row, cat in enumerate(cats):
            self.exp_table.insertRow(row)
            self.exp_table.setItem(row, 0, QTableWidgetItem(str(cat['id'])))
            self.exp_table.setItem(row, 1, QTableWidgetItem(cat['name']))
            self.del_exp_combo.addItem(cat['name'])
            
        self.del_exp_combo.blockSignals(False)

    def add_exp_category(self):
        name = self.exp_cat_input.text().strip()
        if not name: return
        try:
            execute_query("INSERT INTO expense_categories (name) VALUES (?)", (name,))
            self.exp_cat_input.clear()
            self.load_exp_categories()
        except Exception:
            QMessageBox.warning(self, "Error", "Expense category already exists.")
            
    def delete_exp_category(self):
        cat = self.del_exp_combo.currentText()
        if not cat: return
        reply = QMessageBox.question(self, "Confirm", f"Delete expense category '{cat}'?\n\nExisting expenses under this category will NOT be deleted.", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            execute_query("DELETE FROM expense_categories WHERE name=?", (cat,))
            self.load_exp_categories()

class TransactionsTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: Use this screen to record monthly charges (Dues) OR money received (Payments).")
        info_label.setStyleSheet("color: #555; font-style: italic;")
        layout.addWidget(info_label)
        
        forms_layout = QHBoxLayout()
        
        # Add Due Section (Left)
        due_group = QGroupBox("1. Record a New Charge (DUE)")
        due_layout = QFormLayout()
        due_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        due_layout.setSpacing(15)
        
        self.due_flat_combo = QComboBox()
        self.due_cat_combo = QComboBox()
        self.due_amount = QLineEdit()
        self.due_amount.setPlaceholderText("e.g. 1500")
        self.due_date = QDateEdit()
        self.due_date.setCalendarPopup(True)
        self.due_date.setDate(QDate.currentDate())
        self.due_notes = QLineEdit(placeholderText="e.g. Jan 2026 Maintenance")
        
        due_btn = QPushButton("Submit Charge (Due)")
        due_btn.setObjectName("dangerBtn")
        due_btn.clicked.connect(self.add_due)
        
        due_layout.addRow("Select Apartment:", self.due_flat_combo)
        due_layout.addRow("Charge Type:", self.due_cat_combo)
        due_layout.addRow("Amount (Rs):", self.due_amount)
        due_layout.addRow("Charge Date:", self.due_date)
        due_layout.addRow("Billing Period / Notes:", self.due_notes)
        due_layout.addRow("", due_btn)
        due_group.setLayout(due_layout)
        
        # Add Payment Section (Right)
        pay_group = QGroupBox("2. Record Money Received (PAYMENT)")
        pay_layout = QFormLayout()
        pay_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        pay_layout.setSpacing(15)
        
        self.pay_flat_combo = QComboBox()
        self.pay_cat_combo = QComboBox()
        self.pay_amount = QLineEdit()
        self.pay_amount.setPlaceholderText("e.g. 1500")
        self.pay_date = QDateEdit()
        self.pay_date.setCalendarPopup(True)
        self.pay_date.setDate(QDate.currentDate())
        self.pay_mode = QComboBox()
        self.pay_mode.addItems(["Cash", "Cheque", "UPI", "Bank Transfer/NEFT"])
        self.pay_ref = QLineEdit(placeholderText="Cheque No / UTR / UPI ID")
        self.pay_notes = QLineEdit(placeholderText="Any extra notes...")
        
        pay_btn = QPushButton("Submit Payment Receipt")
        pay_btn.setObjectName("actionBtn")
        pay_btn.clicked.connect(self.add_payment)
        
        pay_layout.addRow("Select Apartment:", self.pay_flat_combo)
        pay_layout.addRow("Paying For:", self.pay_cat_combo)
        pay_layout.addRow("Amount Received (Rs):", self.pay_amount)
        pay_layout.addRow("Payment Date:", self.pay_date)
        pay_layout.addRow("Payment Method:", self.pay_mode)
        pay_layout.addRow("Reference Number:", self.pay_ref)
        pay_layout.addRow("Remarks/Notes:", self.pay_notes)
        pay_layout.addRow("", pay_btn)
        pay_group.setLayout(pay_layout)
        
        forms_layout.addWidget(due_group)
        forms_layout.addWidget(pay_group)
        layout.addLayout(forms_layout)
        self.setLayout(layout)
        
    def refresh_dropdowns(self):
        flats = [f['flat_no'] for f in fetch_query("SELECT flat_no FROM flats")]
        cats = fetch_query("SELECT id, name FROM categories")
        
        self.due_flat_combo.clear()
        self.due_flat_combo.addItems(flats)
        self.pay_flat_combo.clear()
        self.pay_flat_combo.addItems(flats)
        
        self.due_cat_combo.clear()
        self.pay_cat_combo.clear()
        for cat in cats:
            self.due_cat_combo.addItem(cat['name'], userData=cat['id'])
            self.pay_cat_combo.addItem(cat['name'], userData=cat['id'])
            
    def add_due(self):
        flat = self.due_flat_combo.currentText()
        cat_id = self.due_cat_combo.currentData()
        cat_name = self.due_cat_combo.currentText()
        amount = self.due_amount.text()
        date = self.due_date.date().toString(Qt.DateFormat.ISODate)
        notes = self.due_notes.text()
        
        if not flat or not amount:
            QMessageBox.warning(self, "Missing Information", "Please select an apartment and enter the amount.")
            return
            
        try:
            amt = float(amount)
            execute_query('''
                INSERT INTO transactions (flat_no, category_id, type, amount, date, notes)
                VALUES (?, ?, 'DUE', ?, ?, ?)
            ''', (flat, cat_id, amt, date, notes))
            QMessageBox.information(self, "Success", f"Charge of Rs. {amt:,.2f} for {cat_name} successfully added to Flat {flat}.")
            self.due_amount.clear()
            self.due_notes.clear()
        except ValueError:
            QMessageBox.warning(self, "Invalid Entry", "Amount must be a valid number (e.g. 1500 or 1500.50).")
            
    def add_payment(self):
        flat = self.pay_flat_combo.currentText()
        cat_id = self.pay_cat_combo.currentData()
        cat_name = self.pay_cat_combo.currentText()
        amount = self.pay_amount.text()
        date = self.pay_date.date().toString(Qt.DateFormat.ISODate)
        mode = self.pay_mode.currentText()
        ref = self.pay_ref.text()
        notes = self.pay_notes.text()
        
        if not flat or not amount:
            QMessageBox.warning(self, "Missing Information", "Please select an apartment and enter the amount.")
            return
            
        try:
            amt = float(amount)
            execute_query('''
                INSERT INTO transactions (flat_no, category_id, type, amount, date, payment_mode, reference_no, notes)
                VALUES (?, ?, 'PAYMENT', ?, ?, ?, ?, ?)
            ''', (flat, cat_id, amt, date, mode, ref, notes))
            QMessageBox.information(self, "Success", f"Payment of Rs. {amt:,.2f} for {cat_name} successfully recorded for Flat {flat}.")
            self.pay_amount.clear()
            self.pay_ref.clear()
            self.pay_notes.clear()
        except ValueError:
            QMessageBox.warning(self, "Invalid Entry", "Amount must be a valid number (e.g. 1500 or 1500.50).")

class LedgerTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: Select an apartment below to view its passbook/ledger. You can print receipts or export to Excel.")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        top_layout = QHBoxLayout()
        
        self.flat_combo = QComboBox()
        self.flat_combo.setMinimumWidth(200)
        self.flat_combo.currentIndexChanged.connect(self.load_ledger)
        
        top_layout.addWidget(QLabel("Select Apartment:"))
        top_layout.addWidget(self.flat_combo)
        
        # Date Range Filters
        top_layout.addSpacing(20)
        top_layout.addWidget(QLabel("Category:"))
        self.filter_cat_combo = QComboBox()
        top_layout.addWidget(self.filter_cat_combo)
        
        top_layout.addWidget(QLabel("From:"))
        self.from_date = QDateEdit()
        self.from_date.setCalendarPopup(True)
        self.from_date.setDate(QDate.currentDate().addMonths(-6)) # Default to past 6 months
        top_layout.addWidget(self.from_date)
        
        top_layout.addWidget(QLabel("To:"))
        self.to_date = QDateEdit()
        self.to_date.setCalendarPopup(True)
        self.to_date.setDate(QDate.currentDate())
        top_layout.addWidget(self.to_date)
        
        btn_filter = QPushButton("Apply Filter")
        btn_filter.clicked.connect(self.load_ledger)
        top_layout.addWidget(btn_filter)
        
        top_layout.addStretch()
        
        btn_excel = QPushButton("Export to Excel")
        btn_excel.setObjectName("actionBtn")
        btn_excel.clicked.connect(self.export_excel)
        
        btn_receipt = QPushButton("Print PDF Receipt")
        btn_receipt.clicked.connect(self.generate_receipt)
        
        top_layout.addWidget(btn_excel)
        top_layout.addWidget(btn_receipt)
        
        # Summary Area as a Table
        self.summary_group = QGroupBox("Outstanding Dues Summary (Arrears)")
        self.summary_group.setStyleSheet("QGroupBox { background-color: #FFF5F5; border: 2px solid #D83B01; }")
        sum_layout = QVBoxLayout()
        
        self.summary_table = QTableWidget()
        self.summary_table.setAlternatingRowColors(True)
        self.summary_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.summary_table.setColumnCount(3)
        self.summary_table.setHorizontalHeaderLabels(["Category", "Amount Owed (Rs)", "Months Delayed"])
        self.summary_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.summary_table.setMaximumHeight(150)
        
        self.summary_total_label = QLabel("GRAND TOTAL OWED: Rs. 0.00")
        self.summary_total_label.setStyleSheet("font-weight: bold; font-size: 16pt; color: #D83B01;")
        
        sum_layout.addWidget(self.summary_table)
        sum_layout.addWidget(self.summary_total_label)
        self.summary_group.setLayout(sum_layout)
        
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels(["ID", "Date", "Record Type", "Category", "Amount (Rs)", "Payment Method", "Reference No.", "Remarks / Billing Period"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.hideColumn(0) # Hide ID column
        
        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel("Filter:"))
        self.search_bar = create_search_bar(self.table)
        search_layout.addWidget(self.search_bar)
        
        btn_delete = QPushButton("Delete Selected Record")
        btn_delete.setObjectName("dangerBtn")
        btn_delete.clicked.connect(self.delete_transaction)
        search_layout.addWidget(btn_delete)
        
        layout.addLayout(top_layout)
        layout.addWidget(self.summary_group)
        layout.addLayout(search_layout)
        layout.addWidget(self.table)
        self.setLayout(layout)
        
        self.current_arrears = {}
        self.total_arrears = 0
        
    def refresh_dropdowns(self):
        flats = [f['flat_no'] for f in fetch_query("SELECT flat_no FROM flats")]
        cats = fetch_query("SELECT id, name FROM categories")
        
        self.flat_combo.blockSignals(True)
        self.flat_combo.clear()
        self.flat_combo.addItems(flats)
        self.flat_combo.blockSignals(False)
        
        curr_cat = self.filter_cat_combo.currentText()
        self.filter_cat_combo.clear()
        self.filter_cat_combo.addItem("All Categories", userData=None)
        for cat in cats:
            self.filter_cat_combo.addItem(cat['name'], userData=cat['id'])
        self.filter_cat_combo.setCurrentText(curr_cat if curr_cat else "All Categories")
            
        if flats:
            self.load_ledger()
            
    def load_ledger(self):
        flat_no = self.flat_combo.currentText()
        if not flat_no:
            return
            
        from_str = self.from_date.date().toString(Qt.DateFormat.ISODate)
        to_str = self.to_date.date().toString(Qt.DateFormat.ISODate)
        cat_id = self.filter_cat_combo.currentData()
            
        query = '''
            SELECT t.id, t.date, t.type, c.name as category, t.amount, t.payment_mode, t.reference_no, t.notes
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.flat_no = ? AND t.date >= ? AND t.date <= ?
        '''
        params = [flat_no, from_str, to_str]
        
        if cat_id is not None:
            query += " AND t.category_id = ?"
            params.append(cat_id)
            
        query += " ORDER BY t.date DESC, t.id DESC"
        records = fetch_query(query, tuple(params))
        
        self.table.setRowCount(0)
        for row, rec in enumerate(records):
            self.table.insertRow(row)
            
            id_item = QTableWidgetItem(str(rec['id']))
            self.table.setItem(row, 0, id_item)
            
            self.table.setItem(row, 1, QTableWidgetItem(str(rec['date'])))
            
            record_type = "CHARGE (Due)" if rec['type'] == 'DUE' else "RECEIPT (Paid)"
            self.table.setItem(row, 2, QTableWidgetItem(record_type))
            self.table.setItem(row, 3, QTableWidgetItem(rec['category']))
            
            amount_str = f"{rec['amount']:,.2f}"
            amount_item = QTableWidgetItem(amount_str)
            amount_item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            
            if rec['type'] == 'DUE':
                amount_item.setForeground(Qt.GlobalColor.red)
            else:
                amount_item.setForeground(Qt.GlobalColor.darkGreen)
            self.table.setItem(row, 4, amount_item)
            
            self.table.setItem(row, 5, QTableWidgetItem(rec['payment_mode'] or "-"))
            self.table.setItem(row, 6, QTableWidgetItem(rec['reference_no'] or "-"))
            self.table.setItem(row, 7, QTableWidgetItem(rec['notes'] or "-"))
            
        self.calculate_arrears(flat_no)
        filter_table(self.table, self.search_bar.text())
        
    def delete_transaction(self):
        row = self.table.currentRow()
        if row < 0:
            QMessageBox.warning(self, "No Selection", "Please click on a row to select the record you want to delete.")
            return
            
        trans_id = self.table.item(row, 0).text()
        desc = f"{self.table.item(row, 2).text()} for {self.table.item(row, 3).text()} on {self.table.item(row, 1).text()}"
        
        reply = QMessageBox.question(self, "Confirm Deletion", 
                                     f"Are you absolutely sure you want to permanently delete this record?\n\n{desc}",
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            execute_query("DELETE FROM transactions WHERE id=?", (trans_id,))
            QMessageBox.information(self, "Deleted", "Record deleted successfully.")
            self.load_ledger()
        
    def calculate_arrears(self, flat_no):
        categories = fetch_query("SELECT id, name FROM categories")
        self.current_arrears = {}
        self.total_arrears = 0
        
        self.summary_table.setRowCount(0)
        row = 0
        
        for cat in categories:
            cat_id = cat['id']
            cat_name = cat['name']
            
            # Arrears must calculate across ALL time, not just filtered dates
            dues_records = fetch_query("SELECT amount FROM transactions WHERE flat_no=? AND category_id=? AND type='DUE' ORDER BY date ASC", (flat_no, cat_id))
            payments = fetch_query("SELECT SUM(amount) as total FROM transactions WHERE flat_no=? AND category_id=? AND type='PAYMENT'", (flat_no, cat_id))[0]['total'] or 0
            
            total_payments = payments
            unpaid_months = 0
            
            for due in dues_records:
                due_amt = due['amount']
                if total_payments >= due_amt:
                    total_payments -= due_amt
                else:
                    total_payments = 0
                    unpaid_months += 1
                    
            total_dues = sum(d['amount'] for d in dues_records)
            balance = total_dues - payments
            
            if balance != 0:
                self.summary_table.insertRow(row)
                self.summary_table.setItem(row, 0, QTableWidgetItem(cat_name))
                
                amt_item = QTableWidgetItem(f"{balance:,.2f}")
                amt_item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                
                if balance > 0:
                    amt_item.setForeground(Qt.GlobalColor.red)
                    delay_item = QTableWidgetItem(str(unpaid_months) if unpaid_months > 0 else "0")
                else:
                    amt_item.setForeground(Qt.GlobalColor.darkGreen)
                    delay_item = QTableWidgetItem("Advance")
                    
                delay_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                
                self.summary_table.setItem(row, 1, amt_item)
                self.summary_table.setItem(row, 2, delay_item)
                
                self.current_arrears[cat_name] = balance
                self.total_arrears += balance
                row += 1
                
        if self.total_arrears <= 0 and row == 0:
             self.summary_total_label.setText("No outstanding dues! Account is completely settled.")
             self.summary_total_label.setStyleSheet("font-weight: bold; font-size: 16pt; color: #107C41;")
        else:
             self.summary_total_label.setText(f"GRAND TOTAL OWED: Rs. {self.total_arrears:,.2f}")
             self.summary_total_label.setStyleSheet("font-weight: bold; font-size: 16pt; color: #D83B01;")
        
    def export_excel(self):
        flat_no = self.flat_combo.currentText()
        if not flat_no:
            QMessageBox.warning(self, "No Apartment", "Please select an apartment first.")
            return
            
        from_str = self.from_date.date().toString(Qt.DateFormat.ISODate)
        to_str = self.to_date.date().toString(Qt.DateFormat.ISODate)
        cat_id = self.filter_cat_combo.currentData()
            
        query = '''
            SELECT t.date as "Date", t.type as "Record Type", c.name as "Category", t.amount as "Amount (Rs)", 
                   t.payment_mode as "Payment Mode", t.reference_no as "Reference No", t.notes as "Remarks / Billing Period"
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.flat_no = ? AND t.date >= ? AND t.date <= ?
        '''
        params = [flat_no, from_str, to_str]
        
        if cat_id is not None:
            query += " AND t.category_id = ?"
            params.append(cat_id)
            
        query += " ORDER BY t.date ASC, t.id ASC"
        records = fetch_query(query, tuple(params))
        data = [dict(r) for r in records]
        
        for row in data:
            row["Record Type"] = "CHARGE (Due)" if row["Record Type"] == "DUE" else "RECEIPT (Paid)"
        
        filename, _ = QFileDialog.getSaveFileName(self, "Save Excel File", f"Ledger_Flat_{flat_no}.xlsx", "Excel Files (*.xlsx)")
        if filename:
            columns = ["Date", "Record Type", "Category", "Amount (Rs)", "Payment Mode", "Reference No", "Remarks / Billing Period"]
            export_to_excel(data, columns, filename)
            QMessageBox.information(self, "Success", "Excel file created successfully and opened!")
            
    def generate_receipt(self):
        flat_no = self.flat_combo.currentText()
        if not flat_no:
            QMessageBox.warning(self, "No Apartment", "Please select an apartment first.")
            return
            
        flat_info = fetch_query("SELECT * FROM flats WHERE flat_no=?", (flat_no,))[0]
        
        filename, _ = QFileDialog.getSaveFileName(self, "Save PDF Receipt", f"Receipt_Flat_{flat_no}.pdf", "PDF Files (*.pdf)")
        if filename:
            generate_receipt(dict(flat_info), self.current_arrears, self.total_arrears, filename)

class ExpensesTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: Record society expenses here.")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        # Section 1: Record Expense
        form_group = QGroupBox("1. Record New Expense")
        form_layout = QGridLayout()
        
        self.exp_date = QDateEdit()
        self.exp_date.setCalendarPopup(True)
        self.exp_date.setDate(QDate.currentDate())
        
        self.exp_cat = QComboBox()
        self.exp_amount = QLineEdit(placeholderText="e.g. 2500")
        
        self.exp_mode = QComboBox()
        self.exp_mode.addItems(["Cash", "Cheque", "UPI", "Bank Transfer"])
        self.exp_ref = QLineEdit(placeholderText="Cheque No / Ref No")
        self.exp_notes = QLineEdit(placeholderText="Vendor name or description")
        
        btn_add = QPushButton("Submit Expense")
        btn_add.setObjectName("dangerBtn")
        btn_add.setMinimumHeight(35)
        btn_add.clicked.connect(self.add_expense)
        
        # Row 0
        form_layout.addWidget(QLabel("Date:"), 0, 0, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_date, 0, 1)
        form_layout.addWidget(QLabel("Expense Category:"), 0, 2, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_cat, 0, 3)
        form_layout.addWidget(QLabel("Amount (Rs):"), 0, 4, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_amount, 0, 5)
        
        # Row 1
        form_layout.addWidget(QLabel("Payment Mode:"), 1, 0, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_mode, 1, 1)
        form_layout.addWidget(QLabel("Ref Number:"), 1, 2, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_ref, 1, 3)
        form_layout.addWidget(QLabel("Notes/Vendor:"), 1, 4, Qt.AlignmentFlag.AlignRight)
        form_layout.addWidget(self.exp_notes, 1, 5)
        
        # Row 2
        form_layout.addWidget(btn_add, 2, 0, 1, 6)
        
        form_group.setLayout(form_layout)
        layout.addWidget(form_group)
        
        # Section 2: View Expenses
        view_group = QGroupBox("2. View Expenses")
        view_layout_main = QVBoxLayout()
        
        view_layout = QHBoxLayout()
        view_layout.addWidget(QLabel("Category:"))
        self.filter_cat_combo = QComboBox()
        view_layout.addWidget(self.filter_cat_combo)
        
        view_layout.addWidget(QLabel("From:"))
        self.from_date = QDateEdit()
        self.from_date.setCalendarPopup(True)
        self.from_date.setDate(QDate.currentDate().addMonths(-1))
        view_layout.addWidget(self.from_date)
        
        view_layout.addWidget(QLabel("To:"))
        self.to_date = QDateEdit()
        self.to_date.setCalendarPopup(True)
        self.to_date.setDate(QDate.currentDate())
        view_layout.addWidget(self.to_date)
        
        btn_filter = QPushButton("Apply Filter")
        btn_filter.clicked.connect(self.load_expenses)
        view_layout.addWidget(btn_filter)
        
        btn_excel = QPushButton("Export to Excel")
        btn_excel.setObjectName("actionBtn")
        btn_excel.clicked.connect(self.export_excel)
        view_layout.addWidget(btn_excel)
        view_layout.addStretch()
        
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels(["ID", "Date", "Category", "Amount (Rs)", "Mode", "Reference", "Notes"])
        self.table.hideColumn(0)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        
        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel("Filter:"))
        self.search_bar = create_search_bar(self.table)
        search_layout.addWidget(self.search_bar)
        
        btn_delete = QPushButton("Delete Selected Record")
        btn_delete.setObjectName("dangerBtn")
        btn_delete.clicked.connect(self.delete_expense)
        search_layout.addWidget(btn_delete)
        
        self.total_label = QLabel("Total Expenses: Rs. 0.00")
        self.total_label.setStyleSheet("font-weight: bold; font-size: 16pt; color: #D83B01;")
        
        view_layout_main.addLayout(view_layout)
        view_layout_main.addLayout(search_layout)
        view_layout_main.addWidget(self.table)
        view_layout_main.addWidget(self.total_label)
        view_group.setLayout(view_layout_main)
        
        layout.addWidget(view_group)
        self.setLayout(layout)
        
        self.load_dropdowns()
        self.load_expenses()

    def load_dropdowns(self):
        cats = fetch_query("SELECT name FROM expense_categories ORDER BY name ASC")
        
        self.exp_cat.blockSignals(True)
        self.exp_cat.clear()
        
        curr_filter = self.filter_cat_combo.currentText()
        self.filter_cat_combo.blockSignals(True)
        self.filter_cat_combo.clear()
        self.filter_cat_combo.addItem("All Categories")
        
        for cat in cats:
            self.exp_cat.addItem(cat['name'])
            self.filter_cat_combo.addItem(cat['name'])
            
        self.exp_cat.blockSignals(False)
        self.filter_cat_combo.blockSignals(False)
        self.filter_cat_combo.setCurrentText(curr_filter if curr_filter else "All Categories")

    def add_expense(self):
        cat = self.exp_cat.currentText().strip()
        amt_str = self.exp_amount.text().strip()
        date = self.exp_date.date().toString(Qt.DateFormat.ISODate)
        mode = self.exp_mode.currentText()
        ref = self.exp_ref.text()
        notes = self.exp_notes.text()
        
        if not cat or not amt_str:
            QMessageBox.warning(self, "Missing Info", "Please enter category and amount.")
            return
            
        try:
            amt = float(amt_str)
            execute_query('''
                INSERT INTO expenses (date, category, amount, payment_mode, reference_no, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (date, cat, amt, mode, ref, notes))
            QMessageBox.information(self, "Success", "Expense recorded.")
            self.exp_amount.clear()
            self.exp_ref.clear()
            self.exp_notes.clear()
            self.load_expenses()
        except ValueError:
            QMessageBox.warning(self, "Error", "Invalid amount.")
            
    def load_expenses(self):
        from_str = self.from_date.date().toString(Qt.DateFormat.ISODate)
        to_str = self.to_date.date().toString(Qt.DateFormat.ISODate)
        cat = self.filter_cat_combo.currentText()
        
        query = "SELECT * FROM expenses WHERE date >= ? AND date <= ?"
        params = [from_str, to_str]
        
        if cat != "All Categories" and cat.strip():
            query += " AND category = ?"
            params.append(cat)
            
        query += " ORDER BY date DESC, id DESC"
        records = fetch_query(query, tuple(params))
        self.table.setRowCount(0)
        
        total = 0
        for row, rec in enumerate(records):
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(str(rec['id'])))
            self.table.setItem(row, 1, QTableWidgetItem(str(rec['date'])))
            self.table.setItem(row, 2, QTableWidgetItem(str(rec['category'])))
            
            amt_item = QTableWidgetItem(f"{rec['amount']:,.2f}")
            amt_item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            amt_item.setForeground(Qt.GlobalColor.red)
            self.table.setItem(row, 3, amt_item)
            
            self.table.setItem(row, 4, QTableWidgetItem(str(rec['payment_mode'])))
            self.table.setItem(row, 5, QTableWidgetItem(str(rec['reference_no'] or '-')))
            self.table.setItem(row, 6, QTableWidgetItem(str(rec['notes'] or '-')))
            total += rec['amount']
            
        self.total_label.setText(f"Total Expenses (for selected period): Rs. {total:,.2f}")
        filter_table(self.table, self.search_bar.text())
        
    def delete_expense(self):
        row = self.table.currentRow()
        if row < 0:
            QMessageBox.warning(self, "No Selection", "Please select an expense to delete.")
            return
        exp_id = self.table.item(row, 0).text()
        desc = f"{self.table.item(row, 2).text()} - Rs. {self.table.item(row, 3).text()}"
        reply = QMessageBox.question(self, "Confirm Deletion", f"Delete this expense?\n\n{desc}", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            execute_query("DELETE FROM expenses WHERE id=?", (exp_id,))
            self.load_expenses()
            
    def export_excel(self):
        from_str = self.from_date.date().toString(Qt.DateFormat.ISODate)
        to_str = self.to_date.date().toString(Qt.DateFormat.ISODate)
        cat = self.filter_cat_combo.currentText()
        
        query = "SELECT date as Date, category as Category, amount as 'Amount (Rs)', payment_mode as Mode, reference_no as Reference, notes as Notes FROM expenses WHERE date >= ? AND date <= ?"
        params = [from_str, to_str]
        
        if cat != "All Categories" and cat.strip():
            query += " AND category = ?"
            params.append(cat)
            
        query += " ORDER BY date ASC"
        records = fetch_query(query, tuple(params))
        
        if not records:
            QMessageBox.warning(self, "No Data", "No expenses found for this period.")
            return
            
        filename, _ = QFileDialog.getSaveFileName(self, "Save Expenses", f"Expenses_{from_str}_to_{to_str}.xlsx", "Excel Files (*.xlsx)")
        if filename:
            data = [dict(r) for r in records]
            export_to_excel(data, list(data[0].keys()), filename)
            QMessageBox.information(self, "Success", "Excel file created!")

class MasterReportTab(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout()
        
        info_label = QLabel("Instruction: This is the master overview showing outstanding dues for ALL apartments.")
        info_label.setStyleSheet("color: #555; font-style: italic; margin-bottom: 10px;")
        layout.addWidget(info_label)
        
        # Dashboard Overview
        self.dashboard_label = QLabel("Loading society overview...")
        self.dashboard_label.setStyleSheet("font-size: 15pt; color: #005A9E; background-color: #EBEBEB; padding: 15px; border-radius: 5px; font-weight: bold;")
        layout.addWidget(self.dashboard_label)
        
        top_layout = QHBoxLayout()
        
        top_layout.addWidget(QLabel("From Date:"))
        self.from_date = QDateEdit()
        self.from_date.setCalendarPopup(True)
        self.from_date.setDate(QDate(QDate.currentDate().year(), 1, 1))
        top_layout.addWidget(self.from_date)
        
        top_layout.addWidget(QLabel("To Date:"))
        self.to_date = QDateEdit()
        self.to_date.setCalendarPopup(True)
        self.to_date.setDate(QDate.currentDate())
        top_layout.addWidget(self.to_date)
        
        btn_refresh = QPushButton("Apply Date Filter")
        btn_refresh.clicked.connect(self.load_report)
        top_layout.addWidget(btn_refresh)
        
        top_layout.addSpacing(20)
        
        btn_excel = QPushButton("Export to Excel")
        btn_excel.setObjectName("actionBtn")
        btn_excel.clicked.connect(self.export_excel)
        top_layout.addWidget(btn_excel)
        
        top_layout.addStretch()
        layout.addLayout(top_layout)
        
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        
        search_layout = QHBoxLayout()
        
        search_layout.addWidget(QLabel("Delay Filter:"))
        self.delay_filter = QComboBox()
        self.delay_filter.addItems(["Show All Flats", "Delay >= 1 Month", "Delay >= 2 Months", "Delay >= 3 Months", "Delay >= 6 Months"])
        self.delay_filter.currentIndexChanged.connect(self.apply_table_filters)
        search_layout.addWidget(self.delay_filter)
        
        search_layout.addSpacing(20)
        
        search_layout.addWidget(QLabel("Search Details:"))
        self.search_bar = QLineEdit(placeholderText="Type flat number, owner name, etc...")
        self.search_bar.textChanged.connect(self.apply_table_filters)
        search_layout.addWidget(self.search_bar)
        
        layout.addLayout(search_layout)
        layout.addWidget(self.table)
        self.setLayout(layout)
        
        self.report_data = []
        self.columns = []

    def apply_table_filters(self):
        search_text = self.search_bar.text().lower()
        min_delay_idx = self.delay_filter.currentIndex()
        min_delay_val = 0
        if min_delay_idx == 1: min_delay_val = 1
        elif min_delay_idx == 2: min_delay_val = 2
        elif min_delay_idx == 3: min_delay_val = 3
        elif min_delay_idx == 4: min_delay_val = 6
        
        for row in range(self.table.rowCount()):
            # 1. Text Search
            row_visible = False
            if not search_text:
                row_visible = True
            else:
                for col in range(self.table.columnCount()):
                    item = self.table.item(row, col)
                    if item and search_text in item.text().lower():
                        row_visible = True
                        break
            
            # 2. Min Delay Filter
            if row_visible and min_delay_val > 0:
                max_delay_for_row = 0
                for col in range(self.table.columnCount()):
                    header_item = self.table.horizontalHeaderItem(col)
                    if header_item and "(Delay)" in header_item.text():
                        item = self.table.item(row, col)
                        if item:
                            txt = item.text()
                            if "Month" in txt:
                                try:
                                    val = int(txt.split()[0])
                                    if val > max_delay_for_row:
                                        max_delay_for_row = val
                                except ValueError:
                                    pass
                if max_delay_for_row < min_delay_val:
                    row_visible = False
                    
            self.table.setRowHidden(row, not row_visible)
        
    def load_report(self):
        from_str = self.from_date.date().toString(Qt.DateFormat.ISODate)
        to_str = self.to_date.date().toString(Qt.DateFormat.ISODate)
        
        flats = fetch_query("SELECT * FROM flats")
        categories = fetch_query("SELECT id, name FROM categories")
        
        self.columns = ["Flat No", "Owner", "Owner Phone", "Tenant", "Tenant Phone", "Status"]
        for cat in categories:
            self.columns.append(f"{cat['name']} (Rs)")
            self.columns.append(f"{cat['name']} (Delay)")
        self.columns.append("Total Arrears (Rs)")
        
        self.table.setColumnCount(len(self.columns))
        self.table.setHorizontalHeaderLabels(self.columns)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        
        self.report_data = []
        self.table.setRowCount(0)
        
        # Dashboard Stats (Filtered)
        total_flats = len(flats)
        flats_in_arrears = 0
        society_total_arrears = 0
        
        total_collected = fetch_query("SELECT SUM(amount) as total FROM transactions WHERE type='PAYMENT' AND date >= ? AND date <= ?", (from_str, to_str))[0]['total'] or 0
        total_expenses = fetch_query("SELECT SUM(amount) as total FROM expenses WHERE date >= ? AND date <= ?", (from_str, to_str))[0]['total'] or 0
        society_balance = total_collected - total_expenses
        
        for row, flat in enumerate(flats):
            f_dict = dict(flat)
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(f_dict['flat_no']))
            self.table.setItem(row, 1, QTableWidgetItem(f_dict['owner_name']))
            self.table.setItem(row, 2, QTableWidgetItem(f_dict.get('owner_phone', '') or ''))
            
            tenant_name = f_dict['tenant_name'] or ''
            tenant_phone = f_dict.get('tenant_phone', '') or ''
            if f_dict['occupancy_status'] != "Occupied by Tenant":
                tenant_name = "-"
                tenant_phone = "-"
            
            self.table.setItem(row, 3, QTableWidgetItem(tenant_name))
            self.table.setItem(row, 4, QTableWidgetItem(tenant_phone))
            self.table.setItem(row, 5, QTableWidgetItem(f_dict['occupancy_status']))
            
            flat_total = 0
            row_data = {
                "Flat No": f_dict['flat_no'],
                "Owner": f_dict['owner_name'],
                "Owner Phone": f_dict.get('owner_phone', '') or '',
                "Tenant": tenant_name,
                "Tenant Phone": tenant_phone,
                "Status": f_dict['occupancy_status']
            }
            
            col_idx = 6
            for cat in categories:
                cat_id = cat['id']
                cat_name = cat['name']
                
                dues_records = fetch_query("SELECT amount FROM transactions WHERE flat_no=? AND category_id=? AND type='DUE' AND date >= ? AND date <= ? ORDER BY date ASC", (f_dict['flat_no'], cat_id, from_str, to_str))
                payments = fetch_query("SELECT SUM(amount) as total FROM transactions WHERE flat_no=? AND category_id=? AND type='PAYMENT' AND date >= ? AND date <= ?", (f_dict['flat_no'], cat_id, from_str, to_str))[0]['total'] or 0
                
                total_payments = payments
                unpaid_months = 0
                
                for due in dues_records:
                    if total_payments >= due['amount']:
                        total_payments -= due['amount']
                    else:
                        total_payments = 0
                        unpaid_months += 1
                        
                total_dues = sum(d['amount'] for d in dues_records)
                balance = total_dues - payments
                
                if balance > 0:
                    flat_total += balance
                
                # Arrears Amount Column
                bal_str = f"{balance:,.2f}"
                amt_item = QTableWidgetItem(bal_str)
                amt_item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                if balance > 0:
                    amt_item.setForeground(Qt.GlobalColor.red)
                elif balance < 0:
                    amt_item.setForeground(Qt.GlobalColor.darkGreen)
                self.table.setItem(row, col_idx, amt_item)
                row_data[f"{cat_name} (Rs)"] = balance
                col_idx += 1
                
                # Delay Column
                delay_str = f"{unpaid_months} Month(s)" if balance > 0 and unpaid_months > 0 else ("0" if balance >= 0 else "Adv")
                delay_item = QTableWidgetItem(delay_str)
                delay_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                if unpaid_months > 0:
                    delay_item.setForeground(Qt.GlobalColor.red)
                self.table.setItem(row, col_idx, delay_item)
                row_data[f"{cat_name} (Delay)"] = delay_str
                col_idx += 1
                
            total_str = f"{flat_total:,.2f}"
            total_item = QTableWidgetItem(total_str)
            total_item.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            
            font = self.table.font()
            font.setBold(True)
            total_item.setFont(font)
            
            if flat_total > 0:
                total_item.setForeground(Qt.GlobalColor.red)
                flats_in_arrears += 1
                society_total_arrears += flat_total
            else:
                total_item.setForeground(Qt.GlobalColor.darkGreen)
                
            self.table.setItem(row, col_idx, total_item)
            row_data["Total Arrears (Rs)"] = flat_total
            self.report_data.append(row_data)
            
        # Update Dashboard Text
        dash_text = f"PERIOD: {from_str} to {to_str}\n"
        dash_text += f"Total Flats: {total_flats}  |  Flats in Arrears (Period): {flats_in_arrears}  |  Period Arrears: Rs. {society_total_arrears:,.2f}\n"
        dash_text += f"Period Income: Rs. {total_collected:,.2f}  |  Period Expenses: Rs. {total_expenses:,.2f}  |  PERIOD BALANCE: Rs. {society_balance:,.2f}"
        self.dashboard_label.setText(dash_text)
            
        self.apply_table_filters()
            
    def export_excel(self):
        if not self.report_data:
            QMessageBox.warning(self, "No Data", "No report data to export.")
            return
            
        filename, _ = QFileDialog.getSaveFileName(self, "Save Master Report", "Master_Report.xlsx", "Excel Files (*.xlsx)")
        if filename:
            export_to_excel(self.report_data, self.columns, filename)
            QMessageBox.information(self, "Success", "Master report exported successfully and opened!")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Apartment Due Tracker & Manager")
        self.resize(1300, 800)
        self.setStyleSheet(STYLESHEET)
        
        self.tabs = QTabWidget()
        
        self.flats_tab = FlatsTab()
        self.categories_tab = CategoriesTab()
        self.transactions_tab = TransactionsTab()
        self.ledger_tab = LedgerTab()
        self.expenses_tab = ExpensesTab()
        self.master_tab = MasterReportTab()
        
        self.tabs.addTab(self.flats_tab, "1. Manage Apartments")
        self.tabs.addTab(self.categories_tab, "2. Manage Categories")
        self.tabs.addTab(self.transactions_tab, "3. Record Transactions")
        self.tabs.addTab(self.ledger_tab, "4. Ledger & Print Receipts")
        self.tabs.addTab(self.expenses_tab, "5. Society Expenses")
        self.tabs.addTab(self.master_tab, "6. Master Report")
        
        self.tabs.currentChanged.connect(self.on_tab_changed)
        
        self.setCentralWidget(self.tabs)
        
    def on_tab_changed(self, index):
        if index == 0:
            self.flats_tab.load_flats()
        elif index == 1:
            self.categories_tab.load_due_categories()
            self.categories_tab.load_exp_categories()
        elif index == 2:
            self.transactions_tab.refresh_dropdowns()
        elif index == 3:
            self.ledger_tab.refresh_dropdowns()
        elif index == 4:
            self.expenses_tab.load_dropdowns()
            self.expenses_tab.load_expenses()
        elif index == 5:
            self.master_tab.load_report()

if __name__ == '__main__':
    init_db()
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
