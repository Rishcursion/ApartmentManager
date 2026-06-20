import os
import subprocess
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

def export_to_excel(data_records, columns, filename):
    df = pd.DataFrame(data_records, columns=columns)
    df.to_excel(filename, index=False)
    open_file(filename)

def generate_receipt(flat_info, category_breakdown, total_owed, filename):
    doc = SimpleDocTemplate(filename, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    # Title
    elements.append(Paragraph("Apartment Due Receipt", styles['Title']))
    elements.append(Spacer(1, 12))

    # Flat Details
    flat_details = [
        ["Flat No:", flat_info['flat_no']],
        ["Owner Name:", flat_info['owner_name']],
    ]
    if flat_info['occupancy_status'] == "Occupied by Tenant" and flat_info['tenant_name']:
        flat_details.append(["Tenant Name:", flat_info['tenant_name']])
        
    flat_details.append(["Occupancy:", flat_info['occupancy_status']])
    
    t_flat = Table(flat_details, colWidths=[100, 300])
    t_flat.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t_flat)
    elements.append(Spacer(1, 24))

    # Breakdown
    elements.append(Paragraph("Dues Breakdown", styles['Heading2']))
    elements.append(Spacer(1, 12))

    breakdown_data = [["Category", "Amount Owed"]]
    for cat, amt in category_breakdown.items():
        breakdown_data.append([cat, f"Rs. {amt:,.2f}"])

    breakdown_data.append(["Total Amount Owed", f"Rs. {total_owed:,.2f}"])

    t_breakdown = Table(breakdown_data, colWidths=[200, 100])
    t_breakdown.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elements.append(t_breakdown)

    doc.build(elements)
    open_file(filename)

def open_file(filename):
    # This works for Windows, macOS, and Linux
    if os.name == 'nt':
        os.startfile(filename)
    elif os.name == 'posix':
        subprocess.call(['xdg-open', filename])
    else:
        subprocess.call(['open', filename])
