"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelUpdateInput_1 = require("../../../inputs/ModelUpdateInput");
const ModelWhereUniqueInput_1 = require("../../../inputs/ModelWhereUniqueInput");
let UpdateOneModelArgs = class UpdateOneModelArgs {
};
exports.UpdateOneModelArgs = UpdateOneModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelUpdateInput_1.ModelUpdateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelUpdateInput_1.ModelUpdateInput)
], UpdateOneModelArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], UpdateOneModelArgs.prototype, "where", void 0);
exports.UpdateOneModelArgs = UpdateOneModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateOneModelArgs);
