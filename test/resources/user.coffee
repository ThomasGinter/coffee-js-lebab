moment = require('moment')

module.exports = (sequelize, DataTypes) ->
    user = sequelize.define 'user',
        whiteLabelId: {type: DataTypes.INTEGER, unique: 'uniq1'}
        username: {type: DataTypes.STRING, allowNull: false, unique: 'uniq1'}
        active: {type: DataTypes.ENUM('active', 'inactive', 'new', 'locked'), allowNull: false, defaultValue: 'new'}
        firstName: {type: DataTypes.STRING} #TODO needs index
        middleName: {type: DataTypes.STRING} #TODO needs index
        lastName: {type: DataTypes.STRING} #TODO needs index
        suffix: {type: DataTypes.STRING}
        address1: {type: DataTypes.STRING}
        address2: {type: DataTypes.STRING}
        city: {type: DataTypes.STRING}
        county: {type: DataTypes.STRING}
        state: {type: DataTypes.STRING(2)}
        zip: {type: DataTypes.STRING(20)}
        country: {type: DataTypes.STRING(3)}
        sameMail: {type: DataTypes.BOOLEAN}
        mailAddress1: {type: DataTypes.STRING}
        mailAddress2: {type: DataTypes.STRING}
        mailCity: {type: DataTypes.STRING}
        mailState: {type: DataTypes.STRING(2)}
        mailZip: {type: DataTypes.STRING(20)}
        mailCountry: {type: DataTypes.STRING(3)}
        phonePrimary: {type: DataTypes.STRING}
        phoneSecondary: {type: DataTypes.STRING}
        email1: {type: DataTypes.STRING} #TODO needs index
        email2: {type: DataTypes.STRING}
        birthdate:
            type: DataTypes.DATE
            get: () ->
                myDate = @.getDataValue('birthdate')
                return null unless myDate
                return moment.utc(myDate).format('M/D/YYYY')
                #return new Date(myDate.getFullYear(), myDate.getMonth(), myDate.getDay())
        gender: {type: DataTypes.STRING(10)}
        password: {type: DataTypes.STRING.BINARY, allowNull: false}
        salt: {type: DataTypes.STRING.BINARY, allowNull: false}
        userData: {type: DataTypes.TEXT} #used for things that definitely won't be searched
        loginCreated: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true} #TODO needs index
        createdBy: {type: DataTypes.INTEGER, allowNull: false}
        updatedBy: {type: DataTypes.INTEGER, allowNull: false}
    ,
        getterMethods:
            userData: () ->
                userData = @getDataValue('userData')
                userData = "{}" unless userData
                JSON.parse(userData)

    user.associate = (models) ->
        user.hasMany(models.userRole, {foreignKey: 'userId', onDelete: 'RESTRICT'})

    user.indexList =
        [
            {columns: ['firstName']}
            {columns: ['middleName']}
            {columns: ['lastName']}
            {columns: ['email1']}
            {columns: ['isCustomer']}
            {columns: ['loginCreated']}
        ]

    user.prototype.setUserData = (key, value) ->
        userData = @.userData
        userData = {} unless userData
        userData[key] = value
        @setDataValue('userData', JSON.stringify(userData))

    user.prototype.clearUserData = (key) ->
        userData = @.userData
        userData = {} unless userData
        delete userData[key]
        @setDataValue('userData', JSON.stringify(userData))

    user


### userData fields
    authorizeNetCustomerProfileId: <Authorize.net customerProfileId>
    authorizeNetPreferredPaymentProfileId: <preferred customerPaymentProfileId]
###