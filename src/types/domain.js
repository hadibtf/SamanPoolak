/**
 * JSDoc domain contracts for the existing JavaScript application.
 * These declarations have no runtime effect. Keep wire units and server IDs
 * explicit in property names; display conversion belongs in the UI layer.
 *
 * @typedef {string} PersonId Server-assigned category-prefixed people ID.
 * @typedef {number} UserId Server-assigned numeric user ID.
 * @typedef {number} OrderId Server-assigned numeric order ID.
 * @typedef {number} ExpenseId Server-assigned numeric expense ID.
 * @typedef {number} MarkingId Server-assigned marking ID.
 * @typedef {string} JalaliDateKey ASCII Jalali YYYYMMDD, never a JS Date.
 * @typedef {number} Rial Amount stored/sent in Rial, before display conversion.
 * @typedef {number} Grams Weight explicitly measured in grams.
 * @typedef {number} Kilograms Weight explicitly measured in kilograms.
 * @typedef {number} PieceCount Production/order quantity counted in pieces.
 *
 * @typedef {Object} Person
 * @property {PersonId} id
 * @property {string} category
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} [fatherName]
 * @property {string[]} [phones]
 * @property {string[]} [addresses]
 * @property {string} [companyName]
 * @property {string} [county]
 * @property {string} [city]
 * @property {string} [nationalCode]
 * @property {string} [iban]
 * @property {string} [bankAccountNumber]
 * @property {string} [birthDate]
 *
 * @typedef {Object} User
 * @property {UserId} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} role
 * Password hashes and write-only credentials are deliberately excluded.
 *
 * @typedef {Object} StateHistory
 * @property {string} state
 * @property {JalaliDateKey|null} date
 * @property {Grams|null} totalWeight
 *
 * @typedef {Object} OrderItem
 * @property {string} uid Stable item UID used by production references.
 * @property {string} productName
 * @property {PieceCount} quantity
 * @property {string} material
 * @property {number|null} [thickness]
 * @property {number|null} [diameter]
 * @property {MarkingId|null} [markingId]
 * @property {string} [markingName]
 * @property {string} [platingColor]
 * @property {boolean} [isHardened]
 * @property {string} [hardeningIntensity]
 * @property {string} [description]
 * @property {Rial|null} [salePrice]
 * @property {Rial|null} [unitCost]
 * @property {string} state
 * @property {StateHistory[]} stateHistory
 * @property {Grams|null} [weightOf10] Weight of ten pieces, in grams.
 * @property {Grams|null} [producedTotalWeight] Legacy/reconciled grams.
 * @property {boolean} [productionStopped] Manager confirmed production is complete.
 *
 * @typedef {Object} Order
 * @property {OrderId} id
 * @property {string} orderNumber Server-assigned YYMMN.
 * @property {JalaliDateKey} date
 * @property {PersonId} customerId
 * @property {string} customerName
 * @property {OrderItem[]} items
 *
 * @typedef {Object} ProductionAssignment
 * @property {number} id
 * @property {OrderId} orderId
 * @property {string} orderItemUid
 * @property {UserId} employeeUserId
 * @property {PieceCount} requiredQuantity
 * @property {Grams|null} weightOf10
 * @property {PieceCount|null} producedQuantity
 * @property {JalaliDateKey} assignedDate
 * @property {string} status
 *
 * @typedef {Object} ProductionLog
 * @property {number|string} id Manager-entered log IDs use a `manager-` prefix.
 * @property {number|null} taskId Manager-entered logs have no employee task.
 * @property {boolean} isManagerEntry
 * @property {UserId} employeeUserId
 * @property {OrderId} orderId
 * @property {string} orderItemUid
 * @property {PieceCount} quantity
 * @property {Grams} totalWeightGrams
 * @property {JalaliDateKey} productionDate
 *
 * @typedef {Object} Expense
 * @property {ExpenseId} id
 * @property {JalaliDateKey} date
 * @property {string} title
 * @property {string} category
 * @property {Rial} amount
 * @property {string} paidTo
 * @property {string} [description]
 *
 * @typedef {Object} Marking
 * @property {MarkingId} id
 * @property {PersonId} customerId
 * @property {string} name
 * @property {string|null} src
 * @property {string} location
 *
 * @typedef {Object} ProductionLogRequest
 * @property {Kilograms} weightKg API input is kilograms; response total is grams.
 * @property {JalaliDateKey} productionDate
 * @property {string} submissionKey
 *
 * @typedef {Object} ManagerProductionLogRequest
 * @property {UserId} employeeUserId
 * @property {Kilograms} weightKg
 * @property {JalaliDateKey} productionDate
 * @property {string} submissionKey
 *
 * @typedef {Object} ProductionAssignmentRequest
 * @property {OrderId} orderId
 * @property {string} orderItemUid
 * @property {UserId} employeeUserId
 * @property {PieceCount} requiredQuantity
 * @property {JalaliDateKey} assignedDate
 *
 * @typedef {Object} ExpenseRequest
 * @property {JalaliDateKey} date
 * @property {string} title
 * @property {string} category
 * @property {Rial} amount API/storage amount remains Rial, regardless of display unit.
 */

export {};
