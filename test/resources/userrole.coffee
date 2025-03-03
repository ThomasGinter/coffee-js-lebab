module.exports = (sequelize, DataTypes) ->
    userRole = sequelize.define 'userRole',
        userId: {type: DataTypes.INTEGER, allowNull: false}
        role: {type: DataTypes.ENUM('ADMIN', 'USER', 'INTERNAL'), allowNull: false}
        #whiteLabelId: {type: DataTypes.INTEGER, allowNull: false} #the user will belong to the whiteLabel not the userrole
        createdBy: {type: DataTypes.INTEGER, allowNull: false}
        updatedBy: {type: DataTypes.INTEGER, allowNull: false}

    userRole.associate = (models) ->
        userRole.belongsTo(models.user, {foreignKey: 'userId', onDelete: 'RESTRICT'})

    userRole